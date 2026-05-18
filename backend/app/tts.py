"""
Kokoro-82M TTS wrapper (`hexgrad/kokoro` → `pip install kokoro`).
Much lighter dependency surface than Chatterbox; uses Misaki + espeak-ng for G2P.

Audio is **24 kHz** float mono (see VOICES.md on the Kokoro HF repo).
Preset voices only — **WAV uploads are ignored** (no zero-shot reference in this backend).
"""

from __future__ import annotations

import logging
import os

import numpy as np

from kokoro import KPipeline

logger = logging.getLogger(__name__)

KOKORO_SAMPLE_RATE = 24_000
_MAX_CHARS = int(os.environ.get("KOKORO_MAX_CHARS", "4000"))
_VOICE_ENV_PREFIX = "KOKORO_VOICE_"

# ISO 639-1 → (kokoro lang_code letter, default voice id) — matches hexgrad VOICES.md
_ISO_TO_KOKORO: dict[str, tuple[str, str]] = {
    "en": ("a", "af_heart"),
    "es": ("e", "ef_dora"),
    "fr": ("f", "ff_siwis"),
    "hi": ("h", "hf_alpha"),
    "it": ("i", "if_sara"),
    "ja": ("j", "jf_alpha"),
    "pt": ("p", "pf_dora"),
    "zh": ("z", "zf_xiaoxiao"),
}


class TTS:
    def __init__(self) -> None:
        self._pipelines: dict[str, KPipeline] = {}
        self.sample_rate: int = KOKORO_SAMPLE_RATE

    def load(self) -> None:
        """Warm up the US-English pipeline; others load on demand."""
        self._get_pipeline("a")
        print(f"[TTS] Kokoro-82M ready (default sr={self.sample_rate} Hz). "
              "Install espeak-ng for best multilingual G2P (see Kokoro README on Windows).")

    def _voice_for_lang(self, lang_code: str, default_voice: str) -> str:
        env_key = _VOICE_ENV_PREFIX + lang_code.upper()
        return os.environ.get(env_key, default_voice)

    def _get_pipeline(self, lang_code: str) -> KPipeline:
        if lang_code not in self._pipelines:
            print(f"[TTS] Loading Kokoro KPipeline(lang_code={lang_code!r}) …")
            self._pipelines[lang_code] = KPipeline(lang_code=lang_code)
        return self._pipelines[lang_code]

    @staticmethod
    def resolve_language_id(iso_code: str) -> tuple[str, bool]:
        """
        Back-compat for pipeline status messages only:
        Returns (effective ISO for display, fallback_to_builtin_en).
        """
        norm = iso_code.strip().lower().split("-")[0]
        if norm in _ISO_TO_KOKORO:
            return norm, False
        return "en", True

    def _route(self, iso: str) -> tuple[str, str, bool]:
        """Resolve to (kokoro_lang_code, voice_id, used_english_fallback)."""
        norm = iso.strip().lower().split("-")[0]
        if norm in _ISO_TO_KOKORO:
            code, dv = _ISO_TO_KOKORO[norm]
            voice = self._voice_for_lang(code, dv)
            return code, voice, False
        en_code, en_voice = _ISO_TO_KOKORO["en"]
        return en_code, self._voice_for_lang(en_code, en_voice), True

    def generate(
        self,
        text: str,
        language_id: str,
        audio_prompt_path: str | None = None,
    ) -> np.ndarray:
        if audio_prompt_path:
            logger.info(
                "Kokoro: ignoring audio_prompt_path=%r (preset voices only).",
                audio_prompt_path,
            )

        lang_code, voice, _ = self._route(language_id)
        pipe = self._get_pipeline(lang_code)

        excerpt = (text or "").strip()[:_MAX_CHARS]
        if not excerpt:
            return np.zeros(0, dtype=np.float32)

        chunks: list[np.ndarray] = []
        generator = pipe(
            excerpt,
            voice=voice,
            speed=float(os.environ.get("KOKORO_SPEED", "1.0")),
            split_pattern=r"\n+",
        )
        for _gs, _ps, audio in generator:
            a = np.asarray(audio, dtype=np.float32).reshape(-1)
            chunks.append(a)

        if not chunks:
            return np.zeros(0, dtype=np.float32)
        return np.concatenate(chunks)

    def chunk_pcm(self, audio: np.ndarray, ms: int = 200) -> list[bytes]:
        samples_per_chunk = int(self.sample_rate * ms / 1000)
        blobs: list[bytes] = []
        for start in range(0, len(audio), samples_per_chunk):
            sl = audio[start : start + samples_per_chunk]
            blobs.append(sl.astype("<f4").tobytes())
        return blobs


tts = TTS()
