# Argus

Real-time speech transcription in the browser, backed by a local vLLM ASR server.

Hold `µ` to record, release to transcribe.

## Stack

- **Frontend** — plain HTML/JS, push-to-talk via Web Audio API
- **Backend** — Node.js + Express, proxies audio to vLLM
- **Model** — [Qwen3-ASR-0.6B](https://huggingface.co/Qwen/Qwen3-ASR-0.6B) served by vLLM

## Project structure

```
Argus/
├── public/
│   └── index.html      # UI
├── src/
│   └── server.js       # Express server
├── scripts/
│   └── start.sh        # Launch vLLM if needed, then npm run dev
├── package.json
└── README.md
```

## Prerequisites

- Node.js 20+
- Python 3.12+ with [uv](https://docs.astral.sh/uv/)
- A GPU with ~2 GB VRAM

## Setup

```bash
git clone https://github.com/AlexandreEDMOND/Argus.git
cd Argus
bash scripts/setup.sh
```

Download the model (first run only):

```bash
.venv/bin/huggingface-cli download Qwen/Qwen3-ASR-0.6B --local-dir ~/models/Qwen3-ASR-0.6B
```

## Usage

```bash
bash scripts/start.sh
```

This will:
1. Start vLLM on `:8236` if not already running
2. Start the web server on `:8000` via `npm run dev`

The vLLM command used:

```bash
vllm serve ~/models/Qwen3-ASR-0.6B/ --port 8236 --gpu-memory-utilization 0.3 --max-model-len 16384
```

Then open **http://localhost:8000** and hold `µ` to transcribe.

## TODO

- [ ] Benchmarker les modèles ASR disponibles sur Hugging Face pour trouver le plus rapide et fiable en français — candidats à tester : Mistral, Qwen (autres tailles), NVIDIA Canary, GLM, Whisper large-v3, et autres modèles récents supportés par vLLM
