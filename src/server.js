import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? 8000);
const MODEL_ROOT = process.env.MODEL_ROOT ?? "/Volumes/T7/models";
const HOST = process.env.MODEL_HOST ?? "127.0.0.1";
const PARAKEET_ASR_PORT = Number(process.env.PARAKEET_ASR_PORT ?? 8802);
const LLM_PORT = Number(process.env.LLM_PORT ?? 8803);
const TTS_PORT = Number(process.env.TTS_PORT ?? 8804);

const PARAKEET_ASR_MODEL = process.env.PARAKEET_ASR_MODEL ?? path.join(MODEL_ROOT, "parakeet-tdt-0.6b-v2");
const LLM_MODEL = process.env.LLM_MODEL ?? path.join(MODEL_ROOT, "Qwen3.5-0.8B");
const TTS_MODEL = process.env.TTS_MODEL ?? path.join(MODEL_ROOT, "Kokoro-82M-MLX");
const TTS_VOICE = process.env.TTS_VOICE ?? "ff_siwis";
const HEALTH_CACHE_MS = Number(process.env.HEALTH_CACHE_MS ?? 4000);

const services = {
  parakeet: {
    id: "parakeet",
    label: "Parakeet ASR",
    description: "Transcription via serveur mlx_audio.server lance a la main",
    type: "audio",
    url: `http://${HOST}:${PARAKEET_ASR_PORT}`,
    healthPath: "/docs",
    model: PARAKEET_ASR_MODEL,
    logs: [],
    stats: createStats(),
    healthCache: { at: 0, ok: false },
  },
  llm: {
    id: "llm",
    label: "LLM",
    description: "Chat via serveur mlx_lm.server lance a la main",
    type: "llm",
    url: `http://${HOST}:${LLM_PORT}`,
    healthPath: "/health",
    model: LLM_MODEL,
    logs: [],
    stats: createStats(),
    healthCache: { at: 0, ok: false },
  },
  tts: {
    id: "tts",
    label: "Kokoro TTS",
    description: "Synthese vocale via serveur mlx_audio.server lance a la main",
    type: "audio",
    url: `http://${HOST}:${TTS_PORT}`,
    healthPath: "/docs",
    model: TTS_MODEL,
    logs: [],
    stats: createStats(),
    healthCache: { at: 0, ok: false },
  },
};

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "../public")));

function createStats() {
  return {
    calls: 0,
    failures: 0,
    lastCallAt: null,
    lastCallMs: null,
    lastCallOk: null,
    healthChecks: 0,
    healthFailures: 0,
    lastHealthAt: null,
    lastHealthOk: false,
    lastHealthMs: null,
  };
}

function pushLog(service, source, text) {
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    service.logs.push({
      ts: new Date().toISOString(),
      source,
      text: line.slice(0, 1200),
    });
  }
  service.logs = service.logs.slice(-160);
}

async function reachable(service, timeoutMs = 900, { force = false } = {}) {
  const now = Date.now();
  if (!force && now - service.healthCache.at < HEALTH_CACHE_MS) return service.healthCache.ok;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = process.hrtime.bigint();
  try {
    const resp = await fetch(`${service.url}${service.healthPath}`, { signal: controller.signal });
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    service.healthCache = { at: Date.now(), ok: resp.ok };
    service.stats.healthChecks += 1;
    service.stats.lastHealthAt = new Date().toISOString();
    service.stats.lastHealthOk = resp.ok;
    service.stats.lastHealthMs = elapsedMs;
    if (!resp.ok) service.stats.healthFailures += 1;
    return resp.ok;
  } catch {
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    service.healthCache = { at: Date.now(), ok: false };
    service.stats.healthChecks += 1;
    service.stats.healthFailures += 1;
    service.stats.lastHealthAt = new Date().toISOString();
    service.stats.lastHealthOk = false;
    service.stats.lastHealthMs = elapsedMs;
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function loadedModels(service, timeoutMs = 1200) {
  if (!await reachable(service, timeoutMs)) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(`${service.url}/v1/models`, { signal: controller.signal });
    if (!resp.ok) return [];
    const data = await resp.json();
    return Array.isArray(data.data) ? data.data.map((item) => item.id).filter(Boolean) : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function serializeService(service) {
  const healthy = await reachable(service);
  const models = healthy ? await loadedModels(service) : [];
  const loaded = models.includes(service.model);
  return {
    id: service.id,
    label: service.label,
    description: service.description,
    type: service.type,
    url: service.url,
    model: service.model,
    healthy,
    loaded,
    loadedModels: models,
    owned: false,
    logs: service.logs.slice(-100),
    stats: service.stats,
  };
}

async function timedCall(service, label, fn) {
  const started = process.hrtime.bigint();
  service.stats.calls += 1;
  service.stats.lastCallAt = new Date().toISOString();
  pushLog(service, "argus", label);
  try {
    const result = await fn();
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    service.stats.lastCallMs = elapsedMs;
    service.stats.lastCallOk = true;
    pushLog(service, "argus", `OK ${Math.round(elapsedMs)} ms`);
    return { result, elapsedMs };
  } catch (err) {
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    service.stats.failures += 1;
    service.stats.lastCallMs = elapsedMs;
    service.stats.lastCallOk = false;
    pushLog(service, "argus", `ERREUR ${Math.round(elapsedMs)} ms: ${err.message}`);
    throw err;
  }
}

async function preloadService(service) {
  if (!await reachable(service, 1200, { force: true })) {
    throw new Error(`${service.label} indisponible sur ${service.url}`);
  }

  if (service.type === "llm") {
    pushLog(service, "argus", "preload ignore: mlx_lm.server charge le modele au demarrage");
    return { ok: true, elapsedMs: 0, skipped: true };
  }

  if (service.type === "audio") {
    const { elapsedMs } = await timedCall(service, `preload ${service.model}`, async () => {
      const resp = await fetch(`${service.url}/v1/models?model_name=${encodeURIComponent(service.model)}`, {
        method: "POST",
      });
      if (!resp.ok) throw new Error(`${resp.status}: ${await resp.text()}`);
      return resp.json().catch(() => ({}));
    });
    return { ok: true, elapsedMs };
  }

  throw new Error(`type de service non gere: ${service.type}`);
}

function extractTranscriptionText(ndjson) {
  let text = "";
  for (const line of ndjson.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const item = JSON.parse(line);
      if (typeof item === "string") text += item;
      else if (typeof item.text === "string") text += item.text;
      else if (typeof item.accumulated === "string") text = item.accumulated;
    } catch {
      text += line;
    }
  }
  return text.trim();
}

async function runLlm(prompt, maxTokens = 256) {
  const service = services.llm;
  const { result, elapsedMs } = await timedCall(service, `chat ${prompt.slice(0, 80)}`, async () => {
    const resp = await fetch(`${service.url}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: service.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: maxTokens,
        temperature: 0,
        seed: 0,
        stream: false,
        chat_template_kwargs: { enable_thinking: false },
      }),
    });
    if (!resp.ok) throw new Error(`${resp.status}: ${await resp.text()}`);
    return resp.json();
  });
  const text = result.choices?.[0]?.message?.content?.trim() || "";
  if (!text) {
    throw new Error(`reponse LLM vide: ${JSON.stringify(result).slice(0, 500)}`);
  }
  return {
    text,
    elapsedMs,
  };
}

async function transcribeAudio(buffer, filename = "audio.wav", language = "") {
  const service = services.parakeet;
  const { result, elapsedMs } = await timedCall(service, `transcription ${filename}`, async () => {
    const form = new FormData();
    form.append("file", new Blob([buffer]), filename);
    form.append("model", service.model);
    form.append("max_tokens", "512");
    if (language) form.append("language", language);

    const resp = await fetch(`${service.url}/v1/audio/transcriptions`, {
      method: "POST",
      body: form,
    });
    if (!resp.ok) throw new Error(`${resp.status}: ${await resp.text()}`);
    return resp.text();
  });
  return {
    text: extractTranscriptionText(result),
    raw: result,
    elapsedMs,
  };
}

async function synthesize(text, voice = TTS_VOICE) {
  const service = services.tts;
  const { result, elapsedMs } = await timedCall(service, `tts ${text.slice(0, 80)}`, async () => {
    const resp = await fetch(`${service.url}/v1/audio/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: service.model,
        input: text,
        voice,
        lang_code: "f",
        response_format: "wav",
      }),
    });
    if (!resp.ok) throw new Error(`${resp.status}: ${await resp.text()}`);
    return Buffer.from(await resp.arrayBuffer());
  });
  return {
    wav: result,
    bytes: result.length,
    elapsedMs,
  };
}

app.get("/api/config", (_req, res) => {
  res.json({
    mode: "inference-only",
    modelRoot: MODEL_ROOT,
    voice: TTS_VOICE,
    services: {
      parakeet: { url: services.parakeet.url, model: services.parakeet.model },
      llm: { url: services.llm.url, model: services.llm.model },
      tts: { url: services.tts.url, model: services.tts.model },
    },
  });
});

app.get("/api/services", async (_req, res) => {
  res.json({ services: await Promise.all(Object.values(services).map(serializeService)) });
});

app.post("/api/services/:id/preload", async (req, res) => {
  const service = services[req.params.id];
  if (!service) return res.status(404).json({ error: "service inconnu" });
  try {
    res.json(await preloadService(service));
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

app.post("/api/llm", async (req, res) => {
  const prompt = req.body?.prompt?.trim();
  const maxTokens = Math.max(1, Math.min(2048, Number(req.body?.maxTokens) || 256));
  if (!prompt) return res.status(400).json({ error: "prompt requis" });
  try {
    res.json({ ok: true, ...await runLlm(prompt, maxTokens) });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

app.post("/api/tts", async (req, res) => {
  const text = req.body?.text?.trim();
  const voice = req.body?.voice?.trim() || TTS_VOICE;
  if (!text) return res.status(400).json({ error: "texte requis" });
  try {
    const audio = await synthesize(text, voice);
    res.json({ ok: true, bytes: audio.bytes, elapsedMs: audio.elapsedMs, wav: audio.wav.toString("base64") });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

app.post("/api/transcribe-file", express.raw({ type: "application/octet-stream", limit: "80mb" }), async (req, res) => {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: "fichier audio requis" });
  }
  const filename = String(req.header("x-file-name") || "audio.wav");
  const language = String(req.header("x-language") || "");
  try {
    res.json({ ok: true, ...await transcribeAudio(req.body, filename, language) });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

const server = app.listen(PORT, "127.0.0.1", () => {
  console.log(`Argus inference: http://localhost:${PORT}`);
  console.log("Model servers are expected to be started manually.");
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} deja utilise. Lance avec PORT=8001 ./start.sh`);
    process.exit(1);
  }
  throw err;
});
