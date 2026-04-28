import os
import time
from typing import Any

import mlx.core as mx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from mlx_lm.generate import generate
from mlx_lm.sample_utils import make_sampler
from mlx_lm.utils import load


MODEL_PATH = os.environ.get("LLM_MODEL", "/Volumes/T7/models/Qwen3.5-0.8B")
MODEL_ID = MODEL_PATH

app = FastAPI()
model = None
tokenizer = None


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    model: str | None = None
    messages: list[ChatMessage]
    max_tokens: int | None = 256
    temperature: float | None = 0.0
    top_p: float | None = 1.0
    stream: bool | None = False
    chat_template_kwargs: dict[str, Any] | None = None


@app.on_event("startup")
async def startup():
    global model, tokenizer
    print(f"Loading LLM: {MODEL_PATH}", flush=True)
    model, tokenizer = load(MODEL_PATH)
    mx.eval(model.parameters())
    print("LLM ready.", flush=True)


@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": model is not None}


@app.get("/v1/models")
async def models():
    return {
        "object": "list",
        "data": [
            {
                "id": MODEL_ID,
                "object": "model",
                "created": int(time.time()),
                "owned_by": "argus",
            }
        ],
    }


def build_prompt(messages: list[ChatMessage], template_kwargs: dict[str, Any] | None) -> str:
    payload = [message.model_dump() for message in messages]
    kwargs = template_kwargs or {}
    if hasattr(tokenizer, "apply_chat_template") and getattr(tokenizer, "has_chat_template", False):
        return tokenizer.apply_chat_template(
            payload,
            tokenize=False,
            add_generation_prompt=True,
            **kwargs,
        )
    return "\n".join(f"{message.role}: {message.content}" for message in messages) + "\nassistant:"


@app.post("/v1/chat/completions")
async def chat_completions(request: ChatRequest):
    if model is None or tokenizer is None:
        raise HTTPException(status_code=503, detail="model not loaded")
    if request.stream:
        raise HTTPException(status_code=400, detail="stream=true is not supported by Argus LLM server")
    if not request.messages:
        raise HTTPException(status_code=400, detail="messages required")

    prompt = build_prompt(request.messages, request.chat_template_kwargs)
    max_tokens = max(1, min(int(request.max_tokens or 256), 4096))
    temperature = float(request.temperature or 0.0)
    top_p = float(request.top_p or 1.0)
    sampler = make_sampler(temp=temperature, top_p=top_p)
    started = time.time()

    try:
      text = generate(
          model,
          tokenizer,
          prompt,
          max_tokens=max_tokens,
          sampler=sampler,
          verbose=False,
      ).strip()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    created = int(time.time())
    return {
        "id": f"chatcmpl-argus-{created}",
        "object": "chat.completion",
        "created": created,
        "model": request.model or MODEL_ID,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": text},
                "finish_reason": "stop",
            }
        ],
        "usage": {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
        },
        "argus": {
            "elapsed_ms": round((time.time() - started) * 1000),
        },
    }
