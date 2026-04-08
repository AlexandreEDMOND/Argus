#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VENV="$PROJECT_DIR/.venv"
MODELS="/home/alex/models"

# ── ASR (vLLM :8236) ────────────────────────────────────────────────────────
if curl -sf http://127.0.0.1:8236/v1/models > /dev/null 2>&1; then
  echo "ASR  déjà actif sur :8236"
else
  echo "ASR  absent, lancement dans un screen..."
  screen -S vllm-asr -X quit 2>/dev/null
  screen -S vllm-asr -dm bash -c "
    cd $PROJECT_DIR
    source $VENV/bin/activate
    vllm serve $MODELS/Qwen3-ASR-0.6B/ \
      --port 8236 \
      --gpu-memory-utilization 0.3 \
      --max-model-len 16384
    exec bash
  "
  echo "En attente du démarrage de l'ASR..."
  until curl -sf http://127.0.0.1:8236/v1/models > /dev/null 2>&1; do
    sleep 2
  done
  echo "ASR  prêt."
fi

# ── LLM (vLLM :8803) ────────────────────────────────────────────────────────
if curl -sf http://127.0.0.1:8803/v1/models > /dev/null 2>&1; then
  echo "LLM  déjà actif sur :8803"
else
  echo "LLM  absent, lancement dans un screen..."
  screen -S vllm-llm -X quit 2>/dev/null
  screen -S vllm-llm -dm bash -c "
    cd $PROJECT_DIR
    source $VENV/bin/activate
    vllm serve $MODELS/Qwen3.5-4B/ \
      --port 8803 \
      --gpu-memory-utilization 0.5 \
      --max-model-len 32768
    exec bash
  "
  echo "En attente du démarrage du LLM..."
  until curl -sf http://127.0.0.1:8803/v1/models > /dev/null 2>&1; do
    sleep 2
  done
  echo "LLM  prêt."
fi

# ── TTS (Kokoro :8804) ───────────────────────────────────────────────────────
if curl -sf http://127.0.0.1:8804/docs > /dev/null 2>&1; then
  echo "TTS  déjà actif sur :8804"
else
  echo "TTS  absent, lancement dans un screen..."
  screen -S tts -X quit 2>/dev/null
  screen -S tts -dm bash -c "
    cd $PROJECT_DIR
    source $VENV/bin/activate
    python $SCRIPT_DIR/tts_server.py
    exec bash
  "
  echo "En attente du démarrage du TTS..."
  until curl -sf http://127.0.0.1:8804/docs > /dev/null 2>&1; do
    sleep 2
  done
  echo "TTS  prêt."
fi

npm run dev
