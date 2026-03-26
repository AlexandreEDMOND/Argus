#!/bin/bash
VENV="$(dirname "$0")/.venv"
MODELS="/home/alex/models"

# Screen 1 : vLLM → Qwen3.5-4B (LLM, port 8001)
screen -S vllm-qwen -dm bash -c "
  source $VENV/bin/activate
  vllm serve $MODELS/Qwen3.5-4B \
    --host 0.0.0.0 \
    --port 8001 \
    --gpu-memory-utilization 0.45
  exec bash
"

# Screen 2 : ASR streaming demo → Qwen3-ASR-1.7B (port 8000)
screen -S asr-demo -dm bash -c "
  source $VENV/bin/activate
  qwen-asr-demo-streaming \
    --asr-model-path $MODELS/Qwen3-ASR-1.7B \
    --host 0.0.0.0 \
    --port 8000 \
    --gpu-memory-utilization 0.45
  exec bash
"

echo ""
echo "Screens lancés :"
echo "  screen -r vllm-qwen   → LLM  Qwen3.5-4B   sur :8001"
echo "  screen -r asr-demo    → ASR  Qwen3-ASR     sur :8000"
echo ""
echo "Interface web : http://localhost:8000"
