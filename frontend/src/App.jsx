import { useState, useEffect, useRef } from "react";

const API_BASE = "/api";

export default function App() {
  const [text, setText] = useState("");
  const [voices, setVoices] = useState([]);
  const [voiceId, setVoiceId] = useState("21m00Tcm4TlvDq8ikWAM");
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [error, setError] = useState(null);
  const [chunkCount, setChunkCount] = useState(null);
  const [textareaFocused, setTextareaFocused] = useState(false);
  const [buttonHovered, setButtonHovered] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    fetch(`${API_BASE}/voices`)
      .then((r) => r.json())
      .then(setVoices)
      .catch(() => setError("Could not load voices — check that the backend is running and ELEVENLABS_API_KEY is set."));
  }, []);

  async function handleNarrate() {
    setLoading(true);
    setError(null);
    setAudioUrl(null);
    try {
      const res = await fetch(`${API_BASE}/narrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice_id: voiceId }),
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const data = await res.json();
      setAudioUrl(data.audio_url);
      setChunkCount(data.chunk_count);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.badge}>ElevenLabs Text-to-Speech</div>
        <h1 style={styles.title}>Narrated</h1>
        <p style={styles.subtitle}>Paste an article or any long text — get it back as narrated audio.</p>

        <textarea
          style={{ ...styles.textarea, ...(textareaFocused ? styles.textareaFocused : {}) }}
          placeholder="Paste your article, blog post, or document text here..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setTextareaFocused(true)}
          onBlur={() => setTextareaFocused(false)}
          rows={12}
        />
        <div style={styles.metaRow}>
          <span style={styles.wordCount}>{wordCount} words</span>

          <select
            style={styles.select}
            value={voiceId}
            onChange={(e) => setVoiceId(e.target.value)}
          >
            {voices.length === 0 && <option>Loading voices...</option>}
            {voices.map((v) => (
              <option key={v.voice_id} value={v.voice_id}>
                {v.name}
              </option>
            ))}
          </select>

          <button
            style={{
              ...styles.button,
              ...(buttonHovered && !loading && text.trim() ? styles.buttonHover : {}),
              opacity: loading || !text.trim() ? 0.6 : 1,
              cursor: loading || !text.trim() ? "not-allowed" : "pointer",
            }}
            onClick={handleNarrate}
            onMouseEnter={() => setButtonHovered(true)}
            onMouseLeave={() => setButtonHovered(false)}
            disabled={loading || !text.trim()}
          >
            {loading && <span style={styles.spinner} />}
            {loading ? "Narrating..." : "Narrate"}
          </button>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        {audioUrl && (
          <div style={styles.playerBlock}>
            <p style={styles.chunkInfo}>
              Generated from {chunkCount} chunk{chunkCount === 1 ? "" : "s"}
            </p>
            <audio ref={audioRef} controls autoPlay src={audioUrl} style={styles.audio} />
            <a href={audioUrl} download="narrated.mp3" style={styles.downloadLink}>
              ↓ Download MP3
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "radial-gradient(circle at 50% -10%, #1c1c24 0%, #0f0f12 55%)",
    color: "#f2f2f2",
    display: "flex",
    justifyContent: "center",
    padding: "64px 20px",
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  container: { width: "100%", maxWidth: 720 },
  badge: {
    display: "inline-block",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 0.4,
    color: "#c9a9ff",
    background: "rgba(155, 92, 255, 0.12)",
    border: "1px solid rgba(155, 92, 255, 0.35)",
    borderRadius: 999,
    padding: "5px 12px",
    marginBottom: 16,
  },
  title: {
    fontSize: 40,
    fontWeight: 700,
    marginBottom: 6,
    letterSpacing: -0.5,
    background: "linear-gradient(135deg, #ffffff 0%, #b9a4ff 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
  },
  subtitle: { color: "#9a9aa2", marginBottom: 28, fontSize: 15 },
  textarea: {
    width: "100%",
    background: "#1a1a1f",
    border: "1px solid #2c2c33",
    borderRadius: 12,
    color: "#f2f2f2",
    padding: 16,
    fontSize: 15,
    lineHeight: 1.5,
    resize: "vertical",
    boxSizing: "border-box",
    outline: "none",
    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
    fontFamily: "inherit",
  },
  textareaFocused: {
    borderColor: "#9b5cff",
    boxShadow: "0 0 0 3px rgba(155, 92, 255, 0.15)",
  },
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginTop: 14,
    flexWrap: "wrap",
  },
  wordCount: { color: "#77777f", fontSize: 13, marginRight: "auto" },
  select: {
    background: "#1a1a1f",
    color: "#f2f2f2",
    border: "1px solid #2c2c33",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 14,
    cursor: "pointer",
  },
  button: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    background: "linear-gradient(135deg, #ffffff 0%, #e4d9ff 100%)",
    color: "#0f0f12",
    border: "none",
    borderRadius: 8,
    padding: "10px 22px",
    fontSize: 14,
    fontWeight: 600,
    transition: "transform 0.12s ease, box-shadow 0.12s ease",
  },
  buttonHover: {
    transform: "translateY(-1px)",
    boxShadow: "0 6px 16px rgba(155, 92, 255, 0.25)",
  },
  spinner: {
    width: 13,
    height: 13,
    border: "2px solid rgba(15, 15, 18, 0.25)",
    borderTopColor: "#0f0f12",
    borderRadius: "50%",
    display: "inline-block",
    animation: "spin 0.7s linear infinite",
  },
  error: {
    marginTop: 16,
    padding: 12,
    background: "#2a1515",
    border: "1px solid #4a2020",
    borderRadius: 8,
    color: "#ff9d9d",
    fontSize: 14,
    animation: "fadeIn 0.2s ease",
  },
  playerBlock: {
    marginTop: 28,
    padding: 20,
    background: "#16161b",
    border: "1px solid #24242b",
    borderRadius: 12,
    animation: "fadeIn 0.25s ease",
  },
  chunkInfo: { color: "#77777f", fontSize: 13, marginBottom: 12 },
  audio: { width: "100%" },
  downloadLink: {
    display: "inline-block",
    marginTop: 12,
    color: "#c9a9ff",
    fontSize: 13,
    fontWeight: 500,
    textDecoration: "none",
  },
};
