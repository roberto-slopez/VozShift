"""
XTTS-v2 voice-cloning TTS wrapper (coqui-tts >= 0.27.5).

Install: pip install -r backend/requirements-clone.txt  (AFTER requirements.txt)
License: XTTS-v2 weights use the Coqui Public Model License (CPML) — non-commercial only.

Usage:
  from .tts_clone import clone_tts
  audio = clone_tts.generate(text="Hello", language="en", speaker_wav="voice_clean.wav")

If coqui-tts is not installed the module loads cleanly but `generate()` raises
CloneTTSUnavailable, which pipeline.py catches and reports via ErrorMsg.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

# backend/audio/ relative to this file's parent (backend/app/ → backend/)
_AUDIO_DIR = Path(__file__).parent.parent / "audio"

# XTTS-v2 language codes (17 supported languages)
# Maps ISO 639-1 → XTTS language string
_ISO_TO_XTTS: dict[str, str] = {
    "en": "en",
    "es": "es",
    "fr": "fr",
    "de": "de",
    "it": "it",
    "pt": "pt",
    "pl": "pl",
    "tr": "tr",
    "ru": "ru",
    "nl": "nl",
    "cs": "cs",
    "ar": "ar",
    "zh": "zh-cn",
    "ja": "ja",
    "hu": "hu",
    "ko": "ko",
    "hi": "hi",
}

XTTS_SAMPLE_RATE = 24_000


class CloneTTSUnavailable(RuntimeError):
    """Raised when coqui-tts is not installed."""


class CloneTTS:
    """
    Lazy-loaded XTTS-v2 wrapper.

    The XTTS model (~1.8 GB) is downloaded from Hugging Face on first use and
    cached in ~/.local/share/tts/ (Linux/Mac) or %LOCALAPPDATA%/tts (Windows).
    """

    def __init__(self) -> None:
        self._tts = None
        self.sample_rate: int = XTTS_SAMPLE_RATE
        self._available: bool | None = None  # None = not yet tried

    def _check_available(self) -> bool:
        if self._available is None:
            try:
                import importlib
                importlib.import_module("TTS")
                self._available = True
            except ImportError:
                self._available = False
                logger.warning(
                    "[CloneTTS] coqui-tts not installed — XTTS cloning disabled. "
                    "Run: pip install -r backend/requirements-clone.txt"
                )
        return self._available  # type: ignore[return-value]

    def is_available(self) -> bool:
        return self._check_available()

    def _ensure_loaded(self) -> None:
        if not self._check_available():
            raise CloneTTSUnavailable(
                "coqui-tts is not installed. "
                "Run: pip install -r backend/requirements-clone.txt"
            )
        if self._tts is not None:
            return

        # Must be set before TTS import to auto-accept license
        os.environ["COQUI_TOS_AGREED"] = "1"

        from TTS.api import TTS  # type: ignore[import-untyped]

        print("[CloneTTS] Loading XTTS-v2 model (~1.8 GB, first-run download)…")
        import torch
        device = "cuda" if torch.cuda.is_available() else "cpu"
        self._tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
        # Update sample rate from model if available
        try:
            sr = self._tts.synthesizer.output_sample_rate  # type: ignore[attr-defined]
            if isinstance(sr, int) and sr > 0:
                self.sample_rate = sr
        except AttributeError:
            pass
        print(f"[CloneTTS] XTTS-v2 ready (device={device}, sr={self.sample_rate} Hz).")

    def _resolve_speaker_wav(self, speaker_wav: str) -> str:
        """
        Accept either a bare filename (looked up in backend/audio/)
        or an absolute path. Raises FileNotFoundError if not found.
        """
        p = Path(speaker_wav)
        if p.is_absolute() and p.is_file():
            return str(p)
        candidate = _AUDIO_DIR / speaker_wav
        if candidate.is_file():
            return str(candidate)
        raise FileNotFoundError(
            f"Voice file {speaker_wav!r} not found. "
            f"Place a WAV/MP3/FLAC file in backend/audio/ and select it from the picker."
        )

    def _resolve_language(self, iso: str) -> str:
        """Map ISO 639-1 → XTTS language string, fall back to English."""
        norm = iso.strip().lower().split("-")[0]
        lang = _ISO_TO_XTTS.get(norm)
        if lang is None:
            logger.warning(
                "[CloneTTS] ISO %r not in XTTS language set; falling back to English.", iso
            )
            return "en"
        return lang

    def generate(
        self,
        text: str,
        language: str,
        speaker_wav: str,
    ) -> np.ndarray:
        """
        Synthesize `text` in `language` cloning the voice from `speaker_wav`.

        Parameters
        ----------
        text:         Text to synthesize (UTF-8).
        language:     ISO 639-1 target language (e.g. "en", "es").
        speaker_wav:  Filename in backend/audio/ or absolute path to reference WAV.

        Returns
        -------
        np.ndarray float32 mono at self.sample_rate Hz.
        """
        self._ensure_loaded()
        assert self._tts is not None

        wav_path = self._resolve_speaker_wav(speaker_wav)
        lang = self._resolve_language(language)
        excerpt = (text or "").strip()
        if not excerpt:
            return np.zeros(0, dtype=np.float32)

        wav_list = self._tts.tts(  # type: ignore[attr-defined]
            text=excerpt,
            speaker_wav=wav_path,
            language=lang,
        )
        return np.asarray(wav_list, dtype=np.float32)

    def chunk_pcm(self, audio: np.ndarray, ms: int = 200) -> list[bytes]:
        """Slice audio array into PCM bytes chunks of `ms` milliseconds."""
        samples_per_chunk = int(self.sample_rate * ms / 1000)
        blobs: list[bytes] = []
        for start in range(0, len(audio), samples_per_chunk):
            sl = audio[start : start + samples_per_chunk]
            blobs.append(sl.astype("<f4").tobytes())
        return blobs


clone_tts = CloneTTS()
