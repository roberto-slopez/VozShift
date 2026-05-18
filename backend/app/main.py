"""
VozShift FastAPI application.

Startup: loads Qwen3-ASR by default (`qwen-asr`) plus Kokoro-82M TTS.
         Whisper loads lazily on first whisper session or via POST /settings/model.

Routes:
  GET  /health              → server status + loaded engines
  GET  /languages           → supported language codes for each engine
  GET  /settings            → current Whisper model size + loaded engines
  POST /settings/model      → hot-swap Whisper model size
  GET  /audio-prompts       → (legacy) list audio files under backend/audio/
  WS   /ws/session          → WebSocket session (see ws.py)
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .languages import WHISPER_LANGUAGES, QWEN_LANGUAGES, VALID_WHISPER_SIZES
from .stt import stt
from .tts import tts
from .translator import NLLB_MODEL_NAME, TRANSLATION_PAIRS
from .ws import session_endpoint

AUDIO_DIR = Path(__file__).parent.parent / "audio"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Qwen3-ASR is the default engine – load it eagerly.
    # Whisper is loaded lazily on first request (or via POST /settings/model).
    await asyncio.to_thread(stt.load_qwen)
    await asyncio.to_thread(tts.load)
    yield


app = FastAPI(title="VozShift", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request/response models ──────────────────────────────────────────────────

class ModelRequest(BaseModel):
    model_size: str


# ── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "whisper_loaded": stt.whisper_loaded,
        "whisper_size": stt.whisper_size,
        "qwen_loaded": stt.qwen_loaded,
        "tts_sample_rate": tts.sample_rate,
    }


@app.get("/settings")
async def get_settings() -> dict:
    return {
        "whisper_size": stt.whisper_size,
        "whisper_valid_sizes": list(VALID_WHISPER_SIZES),
        "whisper_loaded": stt.whisper_loaded,
        "qwen_loaded": stt.qwen_loaded,
    }


@app.post("/settings/model")
async def change_whisper_model(req: ModelRequest) -> dict:
    """Load or hot-swap the Whisper model. Also triggers lazy-load if Whisper isn't loaded yet."""
    if req.model_size not in VALID_WHISPER_SIZES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid model size. Valid options: {list(VALID_WHISPER_SIZES)}",
        )
    if req.model_size == stt.whisper_size and stt.whisper_loaded:
        return {"status": "unchanged", "model_size": stt.whisper_size}

    action = "Loading" if not stt.whisper_loaded else "Reloading"
    logger.info("%s Whisper model: %s → %s", action, stt.whisper_size, req.model_size)
    await asyncio.to_thread(stt.reload_whisper, req.model_size)
    return {"status": "ok", "model_size": stt.whisper_size}


@app.get("/languages")
async def get_languages() -> dict:
    """Return supported language codes/names per engine and NLLB translation pairs."""
    return {
        "whisper": WHISPER_LANGUAGES,
        "qwen3-asr": QWEN_LANGUAGES,
        "translation_model": NLLB_MODEL_NAME,
        "translation_pairs": TRANSLATION_PAIRS,
    }


@app.get("/audio-prompts")
async def list_audio_prompts() -> dict:
    """Legacy: browse backend/audio/. Not used by Kokoro TTS (preset voices only)."""
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(
        p.name for p in AUDIO_DIR.iterdir()
        if p.suffix.lower() in {".wav", ".mp3", ".flac", ".ogg"}
    )
    return {"files": files}


@app.websocket("/ws/session")
async def ws_session(ws: WebSocket) -> None:
    await session_endpoint(ws)
