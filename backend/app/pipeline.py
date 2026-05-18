"""
Pipeline: orchestrates transcode → STT → (optional translation) → token-stream → TTS.

handle_turn() is the single entry point per recorded turn.
Both STT engines support lazy loading:
  - Qwen3-ASR: loaded at startup by default; lazy-loads Whisper on first request
  - Whisper:   lazy-loads on first request if not already loaded
Translation (NLLB-200 distilled) runs only when engine="qwen3-asr" and target_lang ≠ source_lang.
"""

import asyncio

from fastapi import WebSocket

from .protocol import (
    AudioEnd,
    AudioMeta,
    ErrorMsg,
    StatusMsg,
    TranscriptDelta,
    TranscriptFinal,
)
from .stt import stt
from .tts import tts
from .translator import translator
from .transcoder import transcode_webm_to_pcm16k_mono
from .languages import WHISPER_LANGUAGES, QWEN_LANGUAGES


async def _send(ws: WebSocket, msg) -> None:
    await ws.send_text(msg.model_dump_json())


async def _send_status(ws: WebSocket, stage: str, message: str) -> None:
    await _send(ws, StatusMsg(stage=stage, message=message))  # type: ignore[arg-type]


def _lang_name(code: str) -> str:
    return WHISPER_LANGUAGES.get(code) or QWEN_LANGUAGES.get(code, code)


async def handle_turn(
    ws: WebSocket,
    audio_bytes: bytes,
    *,
    engine: str = "qwen3-asr",
    source_lang: str = "es",
    target_lang: str = "en",
    audio_prompt_path: str | None = None,
) -> None:
    """
    Full processing pipeline for a single recorded turn.

    engine:          "whisper" | "qwen3-asr"
    source_lang:     ISO 639-1 code of the spoken language
    target_lang:     Desired output language.
                       Whisper: translate task if source ≠ en and target == en.
                       Qwen3-ASR: NLLB translation used if source ≠ target.
    audio_prompt_path: legacy ignored by Kokoro (logged only).
    """
    try:
        # ── 1. Received ──────────────────────────────────────────────────────
        await _send_status(
            ws,
            "received",
            f"Received {len(audio_bytes):,} bytes of your recording (browser audio; not text yet).",
        )

        # ── 2. Transcode ─────────────────────────────────────────────────────
        await _send_status(
            ws,
            "transcoding",
            "Decoding / down-sampling your recording → mono PCM 16 kHz for the speech recognizer…",
        )
        try:
            pcm16k = await asyncio.to_thread(transcode_webm_to_pcm16k_mono, audio_bytes)
        except RuntimeError as exc:
            await _send(ws, ErrorMsg(code="TRANSCODE_ERROR", message=str(exc)))
            return

        # ── 3. Lazy-load STT engine if needed ────────────────────────────────
        if engine == "qwen3-asr" and not stt.qwen_loaded:
            await _send_status(
                ws,
                "transcribing",
                "Loading Qwen3-ASR-0.6B (~1 GB) — speech→text model; still no translation or TTS…",
            )
            try:
                await asyncio.to_thread(stt.load_qwen)
            except Exception as exc:  # noqa: BLE001
                await _send(ws, ErrorMsg(code="ENGINE_LOAD_ERROR", message=str(exc)))
                return

        elif engine == "whisper" and not stt.whisper_loaded:
            await _send_status(
                ws,
                "transcribing",
                f"Loading Whisper '{stt.whisper_size}' — speech→text (and optional built-in translate to English)…",
            )
            try:
                await asyncio.to_thread(stt.load_whisper, stt.whisper_size)
            except Exception as exc:  # noqa: BLE001
                await _send(ws, ErrorMsg(code="ENGINE_LOAD_ERROR", message=str(exc)))
                return

        # ── 4. STT (transcribe / translate for Whisper) ───────────────────────
        src_name = _lang_name(source_lang)
        tgt_name = _lang_name(target_lang)

        is_whisper_translate = (
            engine == "whisper"
            and source_lang != target_lang
            and target_lang == "en"
        )
        if is_whisper_translate:
            status_line = (
                f"Whisper: {src_name} speech → English transcript text "
                f"(built-in translate; output is text for the chat, not audio yet)."
            )
        elif engine == "qwen3-asr":
            status_line = (
                f"Qwen3-ASR: your speech → transcript text in {src_name} "
                f"(same language as you spoke; still not translated or spoken aloud)."
            )
        else:
            status_line = (
                f"Whisper: your speech → transcript text in {src_name} "
                f"(no machine translation in this step unless using translate mode)."
            )

        await _send_status(ws, "transcribing", status_line)
        try:
            text = await asyncio.to_thread(
                stt.transcribe, pcm16k, engine, source_lang, target_lang
            )
        except Exception as exc:  # noqa: BLE001
            await _send(ws, ErrorMsg(code="STT_ERROR", message=str(exc)))
            return

        if not text:
            await _send(ws, ErrorMsg(code="EMPTY_TRANSCRIPT", message="No speech detected."))
            return

        # ── 5. Post-STT translation (Qwen3-ASR only, when target ≠ source) ───
        if engine == "qwen3-asr" and source_lang != target_lang:
            if not translator.supports(source_lang, target_lang):
                await _send(
                    ws,
                    ErrorMsg(
                        code="UNSUPPORTED_PAIR",
                        message=(
                            f"Translation {src_name} → {tgt_name} is not supported. "
                            "Switch to Whisper for this language pair, or set target = source."
                        ),
                    ),
                )
                return

            await _send_status(
                ws,
                "translating",
                f"Text step: translating the transcript ({src_name} → {tgt_name}) — "
                f"updates the reply string only; you will hear audio after Kokoro runs.",
            )
            try:
                text = await asyncio.to_thread(translator.translate, text, source_lang, target_lang)
            except Exception as exc:  # noqa: BLE001
                await _send(ws, ErrorMsg(code="TRANSLATE_ERROR", message=str(exc)))
                return

        # ── 6. Stream transcript word-by-word (chat UI; still not TTS audio) ─
        await _send_status(
            ws,
            "translating",
            f"Text step: streaming the final reply ({tgt_name}) into the chat word-by-word "
            "(readable text only — spoken audio starts next).",
        )
        words = text.split()
        for word in words:
            await _send(ws, TranscriptDelta(text=word + " "))
            await asyncio.sleep(0.04)
        await _send(ws, TranscriptFinal(text=text))

        # ── 7. TTS synthesis (Kokoro-82M preset voices) ────────────────────────
        await _send_status(
            ws,
            "synthesizing",
            f"Audio step: Kokoro TTS turns the reply text into {tgt_name} speech "
            f"(streaming PCM audio to your browser — this is sound, not more text translation).",
        )

        if audio_prompt_path:
            await _send_status(
                ws,
                "synthesizing",
                "Note: WAV reference prompts are ignored with Kokoro — preset voices/env only "
                "(KOKORO_VOICE_* keys in backend tts.py).",
            )

        _used_iso, tts_fallback = tts.resolve_language_id(target_lang)
        if tts_fallback:
            await _send_status(
                ws,
                "synthesizing",
                f"TTS fallback: Kokoro cannot map “{target_lang}”; "
                "synthesizing with US English voice (common when target is English).",
            )

        try:
            audio_array = await asyncio.to_thread(tts.generate, text, target_lang, None)
        except Exception as exc:  # noqa: BLE001
            await _send(ws, ErrorMsg(code="TTS_ERROR", message=str(exc)))
            return

        # ── 8. Stream TTS audio ───────────────────────────────────────────────
        await _send_status(
            ws,
            "synthesizing",
            f"Sending synthesized audio: {tts.sample_rate} Hz mono (play this as the spoken reply).",
        )
        await _send(ws, AudioMeta(sampleRate=tts.sample_rate, channels=1))
        for chunk in tts.chunk_pcm(audio_array, ms=200):
            await ws.send_bytes(chunk)
            await asyncio.sleep(0)

        await _send(ws, AudioEnd())
        await _send_status(
            ws,
            "done",
            "Turn complete: transcript text is in the chat and the reply audio has finished streaming.",
        )

    except Exception as exc:  # noqa: BLE001
        await _send(ws, ErrorMsg(code="PIPELINE_ERROR", message=str(exc)))
