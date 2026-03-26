#!/bin/bash
set -e

echo "==> Création du venv uv..."
uv venv .venv --python 3.12

echo "==> Installation des packages..."
uv pip install --python .venv/bin/python vllm "qwen-asr[vllm]"

echo "==> Done. Lance maintenant : bash launch.sh"
