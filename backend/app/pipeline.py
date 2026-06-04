"""
Pipeline: orchestrates transcode → STT → (optional translation) → token-stream → TTS.

handle_turn() is the single entry point per recorded turn.

Translation providers:
  "local"   — NLLB-200 (Qwen path) or Whisper built-in translate
  "openai"  — GPT via OpenAI API
  "claude"  — Anthropic Claude API
  "gemini"  — Google Gemini API

TTS engines:
  "kokoro"  — Kokoro-82M preset voices (default)
  "xtts"    — XTTS-v2 zero-shot voice cloning from a reference WAV
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
from .tts_clone import clone_tts, CloneTTSUnavailable
from .translator import translator
from .llm_translator import translate_via_api, VALID_PROVIDERS
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
    # TTS
    tts_engine: str = "kokoro",
    voice_file: str | None = None,
    # Translation provider
    translation_provider: str = "local",
    api_key: str | None = None,
    api_model: str | None = None,
    # legacy (ignored)
    audio_prompt_path: str | None = None,
) -> None:
    """
    Full processing pipeline for a single recorded turn.

    engine:               "whisper" | "qwen3-asr"
    source_lang:          ISO 639-1 spoken language
    target_lang:          ISO 639-1 output language
    tts_engine:           "kokoro" (preset voices) | "xtts" (voice cloning)
    voice_file:           Reference WAV filename in backend/audio/ (XTTS only)
    translation_provider: "local" | "openai" | "claude" | "gemini"
    api_key:              LLM API key (session-only, never logged/stored)
    api_model:            Override LLM model slug (None → use provider default)
    """
    try:
        src_name = _lang_name(source_lang)
        tgt_name = _lang_name(target_lang)

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

        # ── 4. STT ───────────────────────────────────────────────────────────
        # When using an API translation provider we always transcribe-only
        # (even Whisper) so the full transcript reaches the LLM.
        use_api_translation = (
            translation_provider in VALID_PROVIDERS
            and translation_provider != "local"
            and source_lang != target_lang
        )

        # Whisper native translate only applies for the local path
        is_whisper_translate = (
            not use_api_translation
            and engine == "whisper"
            and source_lang != target_lang
            and target_lang == "en"
        )

        if is_whisper_translate:
            status_line = (
                f"Whisper: {src_name} speech → English transcript text "
                "(built-in translate; output is text for the chat, not audio yet)."
            )
            effective_target = target_lang
        elif engine == "qwen3-asr" or use_api_translation:
            status_line = (
                f"{'Qwen3-ASR' if engine == 'qwen3-asr' else 'Whisper'}: "
                f"your speech → transcript text in {src_name} "
                "(transcription only; translation comes next)."
            )
            effective_target = source_lang  # force transcribe-only for STT
        else:
            status_line = (
                f"Whisper: your speech → transcript text in {src_name} "
                "(no machine translation in this step)."
            )
            effective_target = source_lang

        await _send_status(ws, "transcribing", status_line)
        try:
            text = await asyncio.to_thread(
                stt.transcribe,
                pcm16k,
                engine,
                source_lang,
                # Whisper translate only fires when effective_target == "en" and source != "en"
                effective_target if not is_whisper_translate else target_lang,
            )
        except Exception as exc:  # noqa: BLE001
            await _send(ws, ErrorMsg(code="STT_ERROR", message=str(exc)))
            return

        if not text:
            await _send(ws, ErrorMsg(code="EMPTY_TRANSCRIPT", message="No speech detected."))
            return

        # ── 5. Translation ────────────────────────────────────────────────────
        if source_lang != target_lang:

            if use_api_translation:
                # ── 5a. Cloud LLM translation ─────────────────────────────────
                if not api_key:
                    await _send(
                        ws,
                        ErrorMsg(
                            code="MISSING_API_KEY",
                            message=(
                                f"Translation provider '{translation_provider}' requires an API key. "
                                "Enter it in Settings → Translation provider."
                            ),
                        ),
                    )
                    return

                await _send_status(
                    ws,
                    "translating",
                    f"Text step: sending transcript to {translation_provider.title()} "
                    f"({src_name} → {tgt_name}) — still not audio.",
                )
                try:
                    text = await translate_via_api(
                        translation_provider, api_key, api_model,
                        text, source_lang, target_lang
                    )
                except Exception as exc:  # noqa: BLE001
                    await _send(
                        ws,
                        ErrorMsg(
                            code="API_TRANSLATE_ERROR",
                            message=f"{translation_provider.title()} translation failed: {exc}",
                        ),
                    )
                    return

            elif engine == "qwen3-asr" and not is_whisper_translate:
                # ── 5b. Local NLLB translation (Qwen path) ──────────────────
                if not translator.supports(source_lang, target_lang):
                    await _send(
                        ws,
                        ErrorMsg(
                            code="UNSUPPORTED_PAIR",
                            message=(
                                f"Translation {src_name} → {tgt_name} is not supported locally. "
                                "Switch to Whisper (supports translate → en) or use an API provider."
                            ),
                        ),
                    )
                    return

                await _send_status(
                    ws,
                    "translating",
                    f"Text step: translating transcript ({src_name} → {tgt_name}) via NLLB-200 "
                    "— updates reply text only; audio comes after.",
                )
                try:
                    text = await asyncio.to_thread(
                        translator.translate, text, source_lang, target_lang
                    )
                except Exception as exc:  # noqa: BLE001
                    await _send(ws, ErrorMsg(code="TRANSLATE_ERROR", message=str(exc)))
                    return

        # ── 6. Stream transcript word-by-word ─────────────────────────────────
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

        # ── 7. TTS synthesis ──────────────────────────────────────────────────
        if tts_engine == "xtts":
            await _run_xtts(ws, text, target_lang, voice_file, tgt_name)
        else:
            await _run_kokoro(ws, text, target_lang, tgt_name)

    except Exception as exc:  # noqa: BLE001
        await _send(ws, ErrorMsg(code="PIPELINE_ERROR", message=str(exc)))


# ── TTS helpers ───────────────────────────────────────────────────────────────

async def _run_kokoro(
    ws: WebSocket, text: str, target_lang: str, tgt_name: str
) -> None:
    await _send_status(
        ws,
        "synthesizing",
        f"Audio step: Kokoro TTS turns reply text into {tgt_name} speech "
        "(streaming PCM to browser — this is audio, not more translation).",
    )

    _used_iso, tts_fallback = tts.resolve_language_id(target_lang)
    if tts_fallback:
        await _send_status(
            ws,
            "synthesizing",
            f"TTS fallback: Kokoro has no pack for '{target_lang}'; using US English voice.",
        )

    try:
        audio_array = await asyncio.to_thread(tts.generate, text, target_lang, None)
    except Exception as exc:  # noqa: BLE001
        await _send(ws, ErrorMsg(code="TTS_ERROR", message=str(exc)))
        return

    await _send_status(
        ws,
        "synthesizing",
        f"Sending synthesized audio: {tts.sample_rate} Hz mono (Kokoro).",
    )
    await ws.send_text(AudioMeta(sampleRate=tts.sample_rate, channels=1).model_dump_json())
    for chunk in tts.chunk_pcm(audio_array, ms=200):
        await ws.send_bytes(chunk)
        await asyncio.sleep(0)

    await _send(ws, AudioEnd())
    await _send_status(
        ws,
        "done",
        "Turn complete: transcript text is in the chat and the reply audio has finished streaming.",
    )


async def _run_xtts(
    ws: WebSocket,
    text: str,
    target_lang: str,
    voice_file: str | None,
    tgt_name: str,
) -> None:
    if not clone_tts.is_available():
        await _send(
            ws,
            ErrorMsg(
                code="XTTS_UNAVAILABLE",
                message=(
                    "XTTS-v2 is not installed. "
                    "Run: pip install -r backend/requirements-clone.txt, "
                    "then restart the server."
                ),
            ),
        )
        return

    if not voice_file:
        await _send(
            ws,
            ErrorMsg(
                code="XTTS_NO_VOICE",
                message=(
                    "XTTS requires a reference voice file. "
                    "Place a WAV in backend/audio/ and select it in Settings → Voice."
                ),
            ),
        )
        return

    await _send_status(
        ws,
        "synthesizing",
        f"Audio step: XTTS-v2 cloning voice from '{voice_file}' → {tgt_name} speech "
        "(first run downloads ~1.8 GB model).",
    )

    try:
        audio_array = await asyncio.to_thread(
            clone_tts.generate, text, target_lang, voice_file
        )
    except CloneTTSUnavailable as exc:
        await _send(ws, ErrorMsg(code="XTTS_UNAVAILABLE", message=str(exc)))
        return
    except FileNotFoundError as exc:
        await _send(ws, ErrorMsg(code="XTTS_VOICE_NOT_FOUND", message=str(exc)))
        return
    except Exception as exc:  # noqa: BLE001
        await _send(ws, ErrorMsg(code="TTS_ERROR", message=f"XTTS error: {exc}"))
        return

    sr = clone_tts.sample_rate
    await _send_status(ws, "synthesizing", f"Sending XTTS audio: {sr} Hz mono.")
    await ws.send_text(AudioMeta(sampleRate=sr, channels=1).model_dump_json())
    for chunk in clone_tts.chunk_pcm(audio_array, ms=200):
        await ws.send_bytes(chunk)
        await asyncio.sleep(0)

    await _send(ws, AudioEnd())
    await _send_status(
        ws,
        "done",
        "Turn complete: transcript text is in the chat and the cloned voice audio has finished streaming.",
    )
