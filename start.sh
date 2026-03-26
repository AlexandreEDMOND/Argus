#!/bin/bash
VENV="$(dirname "$0")/.venv"
MODELS="/home/alex/models"
DIR="$(cd "$(dirname "$0")" && pwd)"

# Tue les screens existants proprement
screen -S vllm-qwen -X quit 2>/dev/null
screen -S asr-demo  -X quit 2>/dev/null
screen -S web       -X quit 2>/dev/null

# Screen 1 : site mic detector (port 8000)
screen -S web -dm bash -c "
  cd $DIR
  python3 -m http.server 8000
  exec bash
"

# Screen 2 : ASR streaming (port 8001)
screen -S asr-demo -dm bash -c "
  source $VENV/bin/activate
  qwen-asr-demo-streaming \
    --asr-model-path $MODELS/Qwen3-ASR-1.7B \
    --host 0.0.0.0 \
    --port 8001 \
    --gpu-memory-utilization 0.9
  exec bash
"

# Screen 3 : vLLM Qwen3.5-4B (port 8002) — désactivé, pas encore supporté
# screen -S vllm-qwen -dm bash -c "
#   source $VENV/bin/activate
#   vllm serve $MODELS/Qwen3.5-4B --host 0.0.0.0 --port 8002
#   exec bash
# "

echo ""
echo "Services lancés :"
echo "  :8000  → mic detector   (screen -r web)"
echo "  :8001  → ASR streaming  (screen -r asr-demo)  [chargement ~40s]"
echo ""
echo "  http://localhost:8000/mic.html"
echo "  http://localhost:8001"
echo ""
echo "Stop : bash stop.sh"
