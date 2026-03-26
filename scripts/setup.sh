#!/bin/bash
set -e

echo "==> Création du venv uv..."
uv venv .venv --python 3.12

echo "==> Installation de vLLM..."
uv pip install --python .venv/bin/python vllm

echo "==> Installation des dépendances Node..."
npm install

echo "==> Done. Lance maintenant : bash scripts/start.sh"
