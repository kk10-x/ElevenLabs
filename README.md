# Narrated

Paste a long article or block of text in, get back narrated audio using the
ElevenLabs Text-to-Speech API. Built as a full-stack demo project: FastAPI
backend, React (Vite) frontend.

## Why it's structured this way

- **The API key never touches the browser.** All ElevenLabs calls go through
  the FastAPI backend, which reads the key from an environment variable. The
  frontend only ever calls `your-own-backend`.
- **Text is chunked on sentence boundaries** before hitting ElevenLabs, so
  long articles don't get truncated or cut off mid-word, and each request
  stays under a sane size.
- **Chunks are stitched with ffmpeg's concat demuxer** (`-c copy`), which
  re-muxes instead of re-encoding — fast, lossless, and reuses experience
  from working with FFmpeg on media pipelines.
- **A separate `/api/narrate/stream` endpoint** demonstrates ElevenLabs'
  streaming TTS endpoint — useful if you want to start playing audio before
  the full document has finished generating, instead of waiting for the
  whole thing.

## Prerequisites

- Python 3.10+
- Node.js 18+
- `ffmpeg` installed and on your PATH (`brew install ffmpeg` / `apt install ffmpeg`)
- An ElevenLabs API key (free tier works): https://elevenlabs.io

## Setup

### 1. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# edit .env and paste in your ElevenLabs API key

uvicorn main:app --reload --port 8000
```

Backend runs at `http://localhost:8000`. Check `http://localhost:8000/api/health`
to confirm your API key is picked up.

### 2. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173` and proxies `/api` calls to the
backend automatically (see `vite.config.js`).

## Using it

1. Open `http://localhost:5173`
2. Paste in an article or any text
3. Pick a voice from the dropdown (populated live from your ElevenLabs account)
4. Click **Narrate** — wait for synthesis + stitching
5. Play inline or download the MP3

## Possible extensions

- Swap ffmpeg concat for a proper waveform visualizer while generating
- Add the streaming endpoint into the frontend for progressive playback
- Cache generated audio by a hash of (text, voice_id) to avoid re-billing
  identical requests
- Support PDF/URL input instead of paste-only
