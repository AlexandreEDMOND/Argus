"""
TTS server — Kokoro-82M on port 8804.
POST /tts  { "text": "...", "voice": "ff_siwis" }  → audio/wav
"""
import io
import warnings
warnings.filterwarnings("ignore")

import numpy as np
import soundfile as sf
import torch
import uvicorn
from fastapi import FastAPI
from fastapi.responses import Response
from pydantic import BaseModel
from kokoro import KModel, KPipeline

MODEL_DIR = "/home/alex/models/Kokoro-82M"
DEFAULT_VOICE = "ff_siwis"
SR = 24000

app = FastAPI()

print("Chargement de Kokoro…")
model = KModel(
    config=f"{MODEL_DIR}/config.json",
    model=f"{MODEL_DIR}/kokoro-v1_0.pth",
).eval()
pipe = KPipeline(lang_code="f", model=model)
print("Kokoro prêt.")


class TTSRequest(BaseModel):
    text: str
    voice: str = DEFAULT_VOICE


@app.post("/tts")
def tts(req: TTSRequest):
    chunks = []
    for result in pipe(req.text, voice=req.voice):
        audio = result[2]  # torch.Tensor
        chunks.append(audio.numpy() if isinstance(audio, torch.Tensor) else audio)

    samples = np.concatenate(chunks) if chunks else np.zeros(0, dtype=np.float32)
    buf = io.BytesIO()
    sf.write(buf, samples, SR, format="WAV", subtype="PCM_16")
    return Response(content=buf.getvalue(), media_type="audio/wav")


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8804)
