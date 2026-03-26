#!/bin/bash
VENV="$(dirname "$0")/../.venv"
MODELS="/home/alex/models"

# Vérifie si vLLM répond déjà sur :8236
if curl -sf http://127.0.0.1:8236/v1/models > /dev/null 2>&1; then
  echo "vLLM déjà actif sur :8236"
else
  echo "vLLM absent, lancement dans un screen..."
  screen -S vllm -X quit 2>/dev/null
  screen -S vllm -dm bash -c "
    source $VENV/bin/activate
    vllm serve $MODELS/Qwen3-ASR-0.6B/ \
      --port 8236 \
      --gpu-memory-utilization 0.3 \
      --max-model-len 16384
    exec bash
  "
  echo "En attente du démarrage de vLLM..."
  until curl -sf http://127.0.0.1:8236/v1/models > /dev/null 2>&1; do
    sleep 2
  done
  echo "vLLM prêt."
fi

npm run dev
