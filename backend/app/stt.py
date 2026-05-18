"""
STTManager – unified speech-to-text supporting two engines:

  whisper    – openai-whisper (tiny/base/small/medium/large)
               task="translate"  → always outputs English
               task="transcribe" → outputs in source language

  qwen3-asr  – Qwen3-ASR via the official **`qwen-asr`** package (`Qwen3ASRModel`).
               Stock `transformers` does not register `model_type=qwen3_asr`;
               Alibaba ships support through `pip install qwen-asr`.
               Always transcribes in the requested source language when given;
               translation is handled later (NLLB) in the pipeline.

Usage:
    stt.load_qwen()                     # at startup when Qwen is default
    text = stt.transcribe(
        audio,
        engine="whisper",
        source_lang="es",
        target_lang="en",
    )
"""

from __future__ import annotations

import os

import numpy as np

from .languages import (
    QWEN_LANGUAGES,
    VALID_WHISPER_SIZES,
    WHISPER_TRANSLATE_TARGET,
)

__all__ = ["stt", "VALID_WHISPER_SIZES"]

DEFAULT_QWEN_REPO = os.environ.get("QWEN_ASR_MODEL", "Qwen/Qwen3-ASR-0.6B")


class STTManager:
    def __init__(self) -> None:
        self._whisper_model = None
        self._qwen_model = None
        self.whisper_size: str = "small"

    @property
    def whisper_loaded(self) -> bool:
        return self._whisper_model is not None

    @property
    def qwen_loaded(self) -> bool:
        return self._qwen_model is not None

    # ── Whisper ───────────────────────────────────────────────────────────────

    def load_whisper(self, size: str = "small") -> None:
        import whisper as _whisper

        if size not in VALID_WHISPER_SIZES:
            raise ValueError(f"Invalid Whisper size '{size}'. Valid: {VALID_WHISPER_SIZES}")
        print(f"[STT] Loading Whisper '{size}'…")
        self._whisper_model = _whisper.load_model(size)
        self.whisper_size = size
        print("[STT] Whisper ready.")

    def reload_whisper(self, size: str) -> None:
        self.load_whisper(size)

    # ── Qwen3-ASR ───────────────────────────────────────────────────────────────

    def load_qwen(self, model_name: str | None = None) -> None:
        """Load Qwen3-ASR via `qwen-asr` (not raw Hugging Face AutoModelForSpeechSeq2Seq)."""
        if self._qwen_model is not None:
            return

        import torch
        try:
            from qwen_asr import Qwen3ASRModel
        except ImportError as exc:
            raise RuntimeError(
                "The 'qwen-asr' package is required for Qwen3-ASR. "
                'Install it with: py -m pip install -U qwen-asr\n'
                "Stock transformers alone cannot load checkpoints with "
                "`model_type: qwen3_asr`.",
            ) from exc

        path = model_name or DEFAULT_QWEN_REPO
        print(f"[STT] Loading Qwen3-ASR ({path}) via qwen-asr…")

        cuda = torch.cuda.is_available()
        kwargs: dict = {
            "dtype": torch.bfloat16 if cuda else torch.float32,
            "device_map": "cuda:0" if cuda else {"": "cpu"},
            "max_inference_batch_size": int(os.environ.get("QWEN_ASR_BATCH", "1")),
            "max_new_tokens": int(os.environ.get("QWEN_ASR_MAX_NEW_TOKENS", "512")),
        }

        self._qwen_model = Qwen3ASRModel.from_pretrained(path, **kwargs)
        print(f"[STT] Qwen3-ASR ready (cuda={cuda}, repo={path}).")

    # ── Unified API ─────────────────────────────────────────────────────────────

    def transcribe(
        self,
        audio: np.ndarray,
        engine: str = "whisper",
        source_lang: str = "es",
        target_lang: str = "en",
    ) -> str:
        if engine == "whisper":
            return self._whisper_transcribe(audio, source_lang, target_lang)
        if engine == "qwen3-asr":
            return self._qwen_transcribe(audio, source_lang)
        raise ValueError(f"Unknown engine: '{engine}'. Valid: whisper, qwen3-asr")

    def _whisper_transcribe(
        self,
        audio: np.ndarray,
        source_lang: str,
        target_lang: str,
    ) -> str:
        if self._whisper_model is None:
            raise RuntimeError("Whisper not loaded. Call load_whisper() first.")

        task = (
            "translate"
            if target_lang == WHISPER_TRANSLATE_TARGET and source_lang != WHISPER_TRANSLATE_TARGET
            else "transcribe"
        )
        result = self._whisper_model.transcribe(
            audio,
            language=source_lang,
            fp16=False,
            task=task,
        )
        return result["text"].strip()

    def _qwen_transcribe(self, audio: np.ndarray, source_lang: str) -> str:
        if self._qwen_model is None:
            raise RuntimeError("Qwen3-ASR not loaded. Call load_qwen() first.")

        lang_name = QWEN_LANGUAGES.get(source_lang)
        audio_arr = np.asarray(audio, dtype=np.float32)

        results = self._qwen_model.transcribe(
            audio=[(audio_arr, 16_000)],
            language=lang_name,
            return_time_stamps=False,
        )
        if not results:
            return ""
        return results[0].text.strip()


stt = STTManager()
