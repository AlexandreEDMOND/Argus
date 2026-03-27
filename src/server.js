import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ASR_URL    = "http://127.0.0.1:8236";
const ASR_MODEL  = "/home/alex/models/Qwen3-ASR-0.6B/";
const LLM_URL    = "http://127.0.0.1:8803";
const LLM_MODEL  = "/home/alex/models/Qwen3.5-4B/";
const TTS_URL    = "http://127.0.0.1:8804";
const SR         = 16000;
const app = express();

// Regex : phrase terminée par . ! ? (pas suivie d'un autre . pour éviter de couper ...)
const SENTENCE_RE = /[^.!?]*[.!?]+(?=[^.]|$)/g;

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

async function fetchTTS(text) {
  const r = await fetch(`${TTS_URL}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!r.ok) throw new Error(`TTS ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

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

  const sse = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  // TTS : les appels partent en parallèle mais les résultats arrivent dans l'ordre
  let ttsChain = Promise.resolve();
  function dispatchTTS(sentence) {
    const promise = fetchTTS(sentence);
    ttsChain = ttsChain.then(async () => {
      try {
        const wav = await promise;
        sse("audio", { wav: wav.toString("base64") });
      } catch (e) {
        console.error("TTS error:", e.message);
      }
    });
  }

  const decoder = new TextDecoder();
  let sseBuffer  = "";
  let textBuffer = "";  // accumule les tokens content pour détecter les phrases

  for await (const chunk of llmResp.body) {
    sseBuffer += decoder.decode(chunk, { stream: true });
    const lines = sseBuffer.split("\n");
    sseBuffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (raw === "[DONE]") continue;
      let parsed;
      try { parsed = JSON.parse(raw); } catch { continue; }

      const delta = parsed.choices?.[0]?.delta;
      if (!delta) continue;

      if (delta.reasoning) sse("reasoning", { text: delta.reasoning });

      if (delta.content) {
        sse("token", { text: delta.content });
        textBuffer += delta.content;

        // Extrait les phrases complètes et dispatch TTS
        SENTENCE_RE.lastIndex = 0;
        let match, last = 0;
        while ((match = SENTENCE_RE.exec(textBuffer)) !== null) {
          const sentence = match[0].trim();
          if (sentence.length > 2) dispatchTTS(sentence);
          last = match.index + match[0].length;
        }
        textBuffer = textBuffer.slice(last);
      }
    }
  }

  // Envoie le reste du texte s'il ne se termine pas par une ponctuation
  if (textBuffer.trim().length > 2) dispatchTTS(textBuffer.trim());

  // Attend que tous les audios soient envoyés avant de clore
  await ttsChain;
  sse("done", {});
  res.end();
});

// ── start ──────────────────────────────────────────────────────────────────

const PORT = process.env.PORT ?? 8000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Argus → http://localhost:${PORT}`);
  console.log(`ASR   → ${ASR_URL}`);
  console.log(`LLM   → ${LLM_URL}`);
});
