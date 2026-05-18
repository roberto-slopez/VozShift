"""
Machine-translation layer – used after Qwen3-ASR (ASR-only) when the caller
wants a different target language than the source.

Uses a single **facebook/nllb-200-distilled-600M** model (lazy-loaded on first
translation).  Language pairs are selected via FLORES-200 codes per request.

Whisper still handles translate vs transcribe natively; this module is only
used for the Qwen3-ASR path when source_lang != target_lang.
"""

from __future__ import annotations

import torch
from transformers import pipeline as hf_pipeline

NLLB_MODEL_NAME = "facebook/nllb-200-distilled-600M"

# ISO 639-1 (or project-specific) codes → NLLB FLORES-200 codes.
# Covers all languages exposed for Qwen3-ASR in languages.py.
ISO_TO_NLLB: dict[str, str] = {
    "ar": "ara_Arab",
    "cs": "ces_Latn",
    "da": "dan_Latn",
    "de": "deu_Latn",
    "el": "ell_Grek",
    "en": "eng_Latn",
    "es": "spa_Latn",
    "fa": "pes_Arab",
    "fi": "fin_Latn",
    "fil": "tgl_Latn",  # Filipino ≈ Tagalog in NLLB
    "fr": "fra_Latn",
    "hi": "hin_Deva",
    "hu": "hun_Latn",
    "id": "ind_Latn",
    "it": "ita_Latn",
    "ja": "jpn_Jpan",
    "ko": "kor_Hang",
    "mk": "mkd_Cyrl",
    "ms": "zsm_Latn",  # Standard Malay
    "nl": "nld_Latn",
    "pl": "pol_Latn",
    "pt": "por_Latn",
    "ro": "ron_Latn",
    "ru": "rus_Cyrl",
    "sv": "swe_Latn",
    "th": "tha_Thai",
    "tr": "tur_Latn",
    "vi": "vie_Latn",
    "yue": "yue_Hant",
    "zh": "zho_Hans",
}

# Pairs we advertise to the API (matches previous UI: same-lang or → English).
TRANSLATION_PAIRS: list[dict[str, str]] = [
    {"src": src, "tgt": "en"}
    for src in ISO_TO_NLLB
    if src != "en"
]


class Translator:
    """Single shared NLLB pipeline, lazy-loaded."""

    def __init__(self) -> None:
        self._pipe = None

    def _ensure_loaded(self) -> None:
        if self._pipe is not None:
            return
        print(f"[Translator] Loading {NLLB_MODEL_NAME} (~2.5 GB weights + cache)…")
        device = 0 if torch.cuda.is_available() else -1
        self._pipe = hf_pipeline(
            "translation",
            model=NLLB_MODEL_NAME,
            tokenizer=NLLB_MODEL_NAME,
            device=device,
            torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
        )
        print("[Translator] NLLB translation pipeline ready.")

    def supports(self, src: str, tgt: str) -> bool:
        if src == tgt:
            return True
        return src in ISO_TO_NLLB and tgt in ISO_TO_NLLB

    def translate(self, text: str, src: str, tgt: str) -> str:
        if src == tgt:
            return text

        src_code = ISO_TO_NLLB.get(src)
        tgt_code = ISO_TO_NLLB.get(tgt)
        if src_code is None or tgt_code is None:
            raise ValueError(
                f"No NLLB mapping for '{src}' → '{tgt}'. "
                "Pick languages from the supported Qwen/NLLB set."
            )

        self._ensure_loaded()
        assert self._pipe is not None
        result = self._pipe(
            text,
            src_lang=src_code,
            tgt_lang=tgt_code,
            max_length=1024,
            truncation=True,
        )
        out = result[0]["translation_text"]
        return out.strip()


translator = Translator()
