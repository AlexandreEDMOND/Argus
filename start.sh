#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

MODEL_ROOT="${MODEL_ROOT:-/Volumes/T7/models}"
PARAKEET_ASR_MODEL="${PARAKEET_ASR_MODEL:-$MODEL_ROOT/parakeet-tdt-0.6b-v2}"
LLM_MODEL="${LLM_MODEL:-$MODEL_ROOT/Qwen3.5-0.8B}"
TTS_MODEL="${TTS_MODEL:-$MODEL_ROOT/Kokoro-82M-MLX}"
TTS_VOICE="${TTS_VOICE:-ff_siwis}"

HOST="${MODEL_HOST:-127.0.0.1}"
PORT="${PORT:-8000}"
PARAKEET_ASR_PORT="${PARAKEET_ASR_PORT:-8802}"
LLM_PORT="${LLM_PORT:-8803}"
TTS_PORT="${TTS_PORT:-8804}"

UV_BIN="${UV_BIN:-uv}"
PY_AUDIO_BIN="$SCRIPT_DIR/.venv/bin/mlx_audio.server"

usage() {
  cat <<EOF
Usage:
  ./start.sh web              Lance seulement l'interface Argus
  ./start.sh parakeet         Lance le serveur Parakeet ASR sur :$PARAKEET_ASR_PORT
  ./start.sh llm              Lance le serveur LLM Argus sur :$LLM_PORT
  ./start.sh tts              Lance le serveur Kokoro TTS sur :$TTS_PORT
  ./start.sh preload-parakeet Charge Parakeet dans le serveur audio deja lance
  ./start.sh preload-tts      Charge Kokoro dans le serveur audio deja lance
  ./start.sh preload          Charge Parakeet et Kokoro
  ./start.sh commands         Affiche les commandes a lancer dans tes terminaux

Sans argument, lance: ./start.sh web
EOF
}

ensure_node() {
  if [ ! -d "node_modules" ]; then
    echo "==> Dependances Node absentes, installation..."
    npm install
  fi
}

ensure_uv_env() {
  if [ ! -d ".venv" ]; then
    echo "==> Environnement Python absent, installation avec uv sync..."
    "$UV_BIN" sync
  fi
}

check_port() {
  local port="$1"
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "==> Le port $port est deja utilise."
    lsof -nP -iTCP:"$port" -sTCP:LISTEN
    exit 1
  fi
}

audio_server() {
  ensure_uv_env
  if [ -x "$PY_AUDIO_BIN" ]; then
    "$PY_AUDIO_BIN" "$@"
  else
    "$UV_BIN" run --project "$SCRIPT_DIR" mlx_audio.server "$@"
  fi
}

llm_server() {
  ensure_uv_env
  LLM_MODEL="$LLM_MODEL" "$UV_BIN" run --project "$SCRIPT_DIR" uvicorn src.llm_server:app "$@"
}

preload_parakeet() {
  curl -X POST "http://$HOST:$PARAKEET_ASR_PORT/v1/models?model_name=$PARAKEET_ASR_MODEL"
}

preload_tts() {
  curl -X POST "http://$HOST:$TTS_PORT/v1/models?model_name=$TTS_MODEL"
}

print_commands() {
  cat <<EOF
Terminal 1 - Parakeet ASR:
  $SCRIPT_DIR/start.sh parakeet

Terminal 2 - LLM:
  $SCRIPT_DIR/start.sh llm

Terminal 3 - Kokoro TTS:
  $SCRIPT_DIR/start.sh tts

Terminal 4 - Argus web:
  $SCRIPT_DIR/start.sh web

Preload audio:
  $SCRIPT_DIR/start.sh preload
EOF
}

case "${1:-web}" in
  web)
    ensure_node
    check_port "$PORT"
    echo "==> Argus Inference: http://localhost:$PORT"
    npm run dev
    ;;
  parakeet)
    check_port "$PARAKEET_ASR_PORT"
    echo "==> Parakeet ASR: http://$HOST:$PARAKEET_ASR_PORT"
    echo "==> Model: $PARAKEET_ASR_MODEL"
    audio_server --host "$HOST" --port "$PARAKEET_ASR_PORT" --workers 1
    ;;
  llm)
    check_port "$LLM_PORT"
    echo "==> LLM: http://$HOST:$LLM_PORT"
    echo "==> Model: $LLM_MODEL"
    llm_server --host "$HOST" --port "$LLM_PORT"
    ;;
  tts)
    check_port "$TTS_PORT"
    echo "==> Kokoro TTS: http://$HOST:$TTS_PORT"
    echo "==> Model: $TTS_MODEL"
    audio_server --host "$HOST" --port "$TTS_PORT" --workers 1
    ;;
  preload-parakeet)
    preload_parakeet
    ;;
  preload-tts)
    preload_tts
    ;;
  preload)
    preload_parakeet
    echo
    preload_tts
    echo
    ;;
  commands)
    print_commands
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    echo "Commande inconnue: $1"
    echo
    usage
    exit 1
    ;;
esac
