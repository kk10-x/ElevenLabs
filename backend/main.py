"""
Narrated — turns long text (articles, blog posts, docs) into narrated audio
using the ElevenLabs Text-to-Speech API.

Run:
    pip install -r requirements.txt
    export ELEVENLABS_API_KEY=your_key_here
    uvicorn main:app --reload --port 8000
"""

import os
import re
import uuid
import subprocess
from pathlib import Path
from typing import List

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY")
ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1"

# Where generated audio files are cached
AUDIO_DIR = Path(__file__).parent / "generated_audio"
AUDIO_DIR.mkdir(exist_ok=True)

app = FastAPI(title="Narrated API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_methods=["*"],
    allow_headers=["*"],
)


class NarrateRequest(BaseModel):
    text: str
    voice_id: str = "21m00Tcm4TlvDq8ikWAM"  # ElevenLabs default demo voice ("Rachel")
    model_id: str = "eleven_multilingual_v2"


class VoiceOut(BaseModel):
    voice_id: str
    name: str
    preview_url: str | None = None


def chunk_text(text: str, max_chars: int = 2000) -> List[str]:
    """
    Split text into TTS-friendly chunks, breaking on sentence boundaries
    (not mid-word) so each chunk stays under ElevenLabs' practical request
    size and the audio doesn't cut off awkwardly.
    """
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    chunks, current = [], ""

    for sentence in sentences:
        if len(current) + len(sentence) + 1 <= max_chars:
            current = f"{current} {sentence}".strip()
        else:
            if current:
                chunks.append(current)
            current = sentence
    if current:
        chunks.append(current)

    return chunks


async def synthesize_chunk(client: httpx.AsyncClient, text: str, voice_id: str, model_id: str) -> bytes:
    if not ELEVENLABS_API_KEY:
        raise HTTPException(500, "ELEVENLABS_API_KEY is not set on the server")

    resp = await client.post(
        f"{ELEVENLABS_BASE_URL}/text-to-speech/{voice_id}",
        headers={
            "xi-api-key": ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        },
        json={
            "text": text,
            "model_id": model_id,
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
        },
        timeout=120.0,
    )
    if resp.status_code != 200:
        raise HTTPException(resp.status_code, f"ElevenLabs error: {resp.text}")
    return resp.content


def stitch_mp3s(mp3_paths: List[Path], output_path: Path) -> None:
    """
    Concatenate multiple MP3 chunks into one file using ffmpeg's concat
    demuxer. This re-muxes rather than re-encodes, so it's fast and lossless.
    """
    list_file = output_path.with_suffix(".txt")
    with open(list_file, "w") as f:
        for p in mp3_paths:
            f.write(f"file '{p.resolve()}'\n")

    subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0",
            "-i", str(list_file),
            "-c", "copy",
            str(output_path),
        ],
        check=True,
        capture_output=True,
    )
    list_file.unlink(missing_ok=True)


@app.get("/api/voices", response_model=List[VoiceOut])
async def list_voices():
    """Proxy to ElevenLabs' voice list so the API key never reaches the browser."""
    if not ELEVENLABS_API_KEY:
        raise HTTPException(500, "ELEVENLABS_API_KEY is not set on the server")

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{ELEVENLABS_BASE_URL}/voices",
            headers={"xi-api-key": ELEVENLABS_API_KEY},
        )
        resp.raise_for_status()
        data = resp.json()

    return [
        VoiceOut(voice_id=v["voice_id"], name=v["name"], preview_url=v.get("preview_url"))
        for v in data.get("voices", [])
    ]


@app.post("/api/narrate")
async def narrate(req: NarrateRequest):
    """
    Full pipeline: chunk text -> synthesize each chunk -> stitch into one
    MP3 -> return a URL the frontend can play/download.
    """
    if not req.text.strip():
        raise HTTPException(400, "text must not be empty")

    chunks = chunk_text(req.text)
    job_id = uuid.uuid4().hex[:12]
    chunk_paths = []

    async with httpx.AsyncClient() as client:
        for i, chunk in enumerate(chunks):
            audio_bytes = await synthesize_chunk(client, chunk, req.voice_id, req.model_id)
            chunk_path = AUDIO_DIR / f"{job_id}_part{i}.mp3"
            chunk_path.write_bytes(audio_bytes)
            chunk_paths.append(chunk_path)

    output_path = AUDIO_DIR / f"{job_id}.mp3"
    if len(chunk_paths) == 1:
        chunk_paths[0].rename(output_path)
    else:
        stitch_mp3s(chunk_paths, output_path)
        for p in chunk_paths:
            p.unlink(missing_ok=True)

    return {"job_id": job_id, "audio_url": f"/api/audio/{job_id}.mp3", "chunk_count": len(chunks)}


@app.get("/api/audio/{filename}")
async def get_audio(filename: str):
    path = AUDIO_DIR / filename
    if not path.exists():
        raise HTTPException(404, "audio not found")
    return FileResponse(path, media_type="audio/mpeg")


@app.post("/api/narrate/stream")
async def narrate_stream(req: NarrateRequest):
    """
    Lower-latency variant: streams the first chunk's audio back to the
    client as it's generated, instead of waiting for the whole document
    to be synthesized and stitched.
    """
    if not req.text.strip():
        raise HTTPException(400, "text must not be empty")

    first_chunk = chunk_text(req.text)[0]

    async def audio_iterator():
        if not ELEVENLABS_API_KEY:
            raise HTTPException(500, "ELEVENLABS_API_KEY is not set on the server")
        async with httpx.AsyncClient() as client:
            async with client.stream(
                "POST",
                f"{ELEVENLABS_BASE_URL}/text-to-speech/{req.voice_id}/stream",
                headers={
                    "xi-api-key": ELEVENLABS_API_KEY,
                    "Content-Type": "application/json",
                    "Accept": "audio/mpeg",
                },
                json={"text": first_chunk, "model_id": req.model_id},
                timeout=120.0,
            ) as resp:
                async for chunk in resp.aiter_bytes():
                    yield chunk

    return StreamingResponse(audio_iterator(), media_type="audio/mpeg")


@app.get("/api/health")
async def health():
    return {"status": "ok", "api_key_configured": bool(ELEVENLABS_API_KEY)}
