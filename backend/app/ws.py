"""
WebSocket endpoint /ws/session

State machine per connection:
  IDLE → (start msg) → RECORDING → (stop msg) → PROCESSING → IDLE
  Any state → (cancel msg) → IDLE
  Any state → (disconnect) → closed

Per-turn settings carried in the 'start' message:
  engine          "whisper" | "qwen3-asr"         (default: "whisper")
  sourceLang      ISO 639-1 source language code   (default: "es")
  targetLang      ISO 639-1 target language code   (default: "en")
  audioPromptPath (optional, ignored): legacy field; Kokoro uses preset voices only
"""

import json
import logging
from enum import Enum, auto

from fastapi import WebSocket, WebSocketDisconnect

from .languages import QWEN_LANGUAGES, WHISPER_LANGUAGES
from .pipeline import handle_turn
from .protocol import ErrorMsg, StatusMsg

logger = logging.getLogger(__name__)

VALID_ENGINES = {"whisper", "qwen3-asr"}


class _State(Enum):
    IDLE = auto()
    RECORDING = auto()
    PROCESSING = auto()


async def session_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    logger.info("WebSocket connected: %s", ws.client)

    state = _State.IDLE
    audio_chunks: list[bytes] = []

    # Per-turn settings (captured from each 'start' message)
    turn_engine: str = "whisper"
    turn_source_lang: str = "es"
    turn_target_lang: str = "en"
    turn_audio_prompt: str | None = None

    async def send_status(stage: str, message: str) -> None:
        await ws.send_text(StatusMsg(stage=stage, message=message).model_dump_json())  # type: ignore[arg-type]

    async def send_error(code: str, message: str) -> None:
        await ws.send_text(ErrorMsg(code=code, message=message).model_dump_json())

    try:
        while True:
            message = await ws.receive()

            # ── Binary frame: audio chunk ──────────────────────────────────
            if "bytes" in message and message["bytes"] is not None:
                if state == _State.RECORDING:
                    audio_chunks.append(message["bytes"])
                else:
                    logger.warning("Binary frame received outside RECORDING state – ignored.")
                continue

            # ── Text frame: JSON control message ───────────────────────────
            if "text" in message and message["text"] is not None:
                try:
                    payload = json.loads(message["text"])
                except json.JSONDecodeError:
                    await send_error("BAD_JSON", "Could not parse JSON message.")
                    continue

                msg_type = payload.get("type", "")

                if msg_type == "start":
                    if state != _State.IDLE:
                        await send_error(
                            "BAD_STATE",
                            f"Received 'start' while in state {state.name}.",
                        )
                        continue

                    # Parse per-turn settings (with validation + sane defaults)
                    engine = payload.get("engine", "whisper")
                    if engine not in VALID_ENGINES:
                        await send_error("BAD_ENGINE", f"Unknown engine: '{engine}'.")
                        continue

                    turn_engine      = engine
                    turn_source_lang = payload.get("sourceLang", "es") or "es"
                    turn_target_lang = payload.get("targetLang", "en") or "en"
                    turn_audio_prompt = payload.get("audioPromptPath") or None

                    audio_chunks.clear()
                    state = _State.RECORDING
                    engine_name = {"qwen3-asr": "Qwen3-ASR", "whisper": "Whisper"}[engine]
                    src_lm = WHISPER_LANGUAGES.get(turn_source_lang) or QWEN_LANGUAGES.get(
                        turn_source_lang, turn_source_lang
                    )
                    tgt_lm = WHISPER_LANGUAGES.get(turn_target_lang) or QWEN_LANGUAGES.get(
                        turn_target_lang, turn_target_lang
                    )
                    plan = (
                        f"Listening to your microphone — expect {engine_name}: "
                        f"speech [{src_lm}] → transcript text; "
                        f"then pipeline output text & audio in [{tgt_lm}] "
                        f"(text in chat first, then Kokoro audio)."
                    )
                    await send_status("recording", plan)
                    logger.info(
                        "Recording started. engine=%s src=%s tgt=%s prompt=%s",
                        turn_engine, turn_source_lang, turn_target_lang, turn_audio_prompt,
                    )

                elif msg_type == "stop":
                    if state != _State.RECORDING:
                        await send_error(
                            "BAD_STATE",
                            f"Received 'stop' while in state {state.name}.",
                        )
                        continue

                    state = _State.PROCESSING
                    full_audio = b"".join(audio_chunks)
                    audio_chunks.clear()
                    logger.info("Recording stopped. Processing %d bytes.", len(full_audio))

                    await handle_turn(
                        ws,
                        full_audio,
                        engine=turn_engine,
                        source_lang=turn_source_lang,
                        target_lang=turn_target_lang,
                        audio_prompt_path=turn_audio_prompt,
                    )
                    state = _State.IDLE

                elif msg_type == "cancel":
                    audio_chunks.clear()
                    state = _State.IDLE
                    await send_status("done", "Cancelled — no transcript, translation, or playback for this turn.")
                    logger.info("Turn cancelled by client.")

                else:
                    await send_error("UNKNOWN_MSG", f"Unknown message type: '{msg_type}'.")

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: %s", ws.client)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected error in session: %s", exc)
        try:
            await ws.send_text(
                ErrorMsg(code="SERVER_ERROR", message=str(exc)).model_dump_json()
            )
        except Exception:
            pass
