import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ASR_URL    = "http://127.0.0.1:8236";
const ASR_MODEL  = "/home/alex/models/Qwen3-ASR-0.6B/";
const LLM_URL    = "http://127.0.0.1:8803";
const LLM_MODEL  = "/home/alex/models/Qwen3.5-4B/";
const SR         = 16000;
const app = express();

// ── utils ──────────────────────────────────────────────────────────────────

function float32ToWav(samples) {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    pcm[i] = Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767)));
  }
  const dataLen = pcm.byteLength;
  const buf = Buffer.alloc(44 + dataLen);
  let o = 0;
  buf.write("RIFF", o);                             o += 4;
  buf.writeUInt32LE(36 + dataLen, o);               o += 4;
  buf.write("WAVE", o);                             o += 4;
  buf.write("fmt ", o);                             o += 4;
  buf.writeUInt32LE(16, o);                         o += 4;
  buf.writeUInt16LE(1, o);                          o += 2;  // PCM
  buf.writeUInt16LE(1, o);                          o += 2;  // mono
  buf.writeUInt32LE(SR, o);                         o += 4;
  buf.writeUInt32LE(SR * 2, o);                     o += 4;
  buf.writeUInt16LE(2, o);                          o += 2;
  buf.writeUInt16LE(16, o);                         o += 2;
  buf.write("data", o);                             o += 4;
  buf.writeUInt32LE(dataLen, o);                    o += 4;
  Buffer.from(pcm.buffer).copy(buf, o);
  return buf;
}

async function transcribe(samples) {
  const wav  = float32ToWav(samples);
  const form = new FormData();
  form.append("file", new Blob([wav], { type: "audio/wav" }), "audio.wav");
  form.append("model", ASR_MODEL);
  form.append("response_format", "json");

  const resp = await fetch(`${ASR_URL}/v1/audio/transcriptions`, {
    method: "POST",
    body: form,
  });

  if (!resp.ok) {
    const msg = await resp.text();
    throw new Error(`${resp.status} ${msg}`);
  }

  const j = await resp.json();
  return j.text ?? "";
}


// ── routes ─────────────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, "../public")));

app.post("/api/transcribe", express.raw({ type: "application/octet-stream", limit: "50mb" }), async (req, res) => {
  const raw = req.body;
  if (!Buffer.isBuffer(raw) || raw.length % 4 !== 0)
    return res.status(400).json({ error: "données float32 invalides" });

  const samples = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  if (samples.length < SR / 10)
    return res.json({ text: "" });

  try {
    const text = await transcribe(samples);
    res.json({ text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/chat", express.json(), async (req, res) => {
  const text = req.body?.text?.trim();
  if (!text) return res.status(400).json({ error: "text manquant" });

  let llmResp;
  try {
    llmResp = await fetch(`${LLM_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [{ role: "user", content: text }],
        max_tokens: 4096,
        stream: true,
        chat_template_kwargs: { enable_thinking: false },
      }),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  if (!llmResp.ok) {
    const msg = await llmResp.text();
    return res.status(llmResp.status).json({ error: msg });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  for await (const chunk of llmResp.body) {
    res.write(chunk);
  }
  res.end();
});

// ── start ──────────────────────────────────────────────────────────────────

const PORT = process.env.PORT ?? 8000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Argus → http://localhost:${PORT}`);
  console.log(`ASR   → ${ASR_URL}`);
  console.log(`LLM   → ${LLM_URL}`);
});
