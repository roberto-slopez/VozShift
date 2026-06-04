"""
LLM-based translation via external APIs.

Supported providers: "openai" | "claude" | "gemini"

API keys are passed per-request from the WebSocket session — they are never
written to disk or logged. STT always runs locally; only the transcript text
is sent to the cloud API.

Usage (async):
    from .llm_translator import translate_via_api
    result = await translate_via_api(
        provider="openai",
        api_key="sk-...",
        model="gpt-4o-mini",    # or None → use provider default
        text="Hola mundo",
        src="es",
        tgt="en",
    )
"""

from __future__ import annotations

import logging

import httpx

logger = logging.getLogger(__name__)

# ── Per-provider defaults ──────────────────────────────────────────────────────

PROVIDER_DEFAULTS: dict[str, dict[str, str]] = {
    "openai": {
        "model":   "gpt-4o-mini",
        "base_url": "https://api.openai.com",
    },
    "claude": {
        "model":   "claude-3-5-haiku-latest",
        "base_url": "https://api.anthropic.com",
        "anthropic_version": "2023-06-01",
    },
    "gemini": {
        "model":   "gemini-1.5-flash",
        "base_url": "https://generativelanguage.googleapis.com",
    },
}

VALID_PROVIDERS = set(PROVIDER_DEFAULTS)

# Shared async client (connection pool reused across turns)
_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=30.0)
    return _client


def _build_prompt(text: str, src: str, tgt: str) -> str:
    return (
        f"Translate the following text from {src} to {tgt}. "
        "Output only the translation, with no commentary, explanations, or extra text.\n\n"
        f"{text}"
    )


# ── OpenAI ────────────────────────────────────────────────────────────────────

async def _translate_openai(
    api_key: str, model: str, base_url: str, text: str, src: str, tgt: str
) -> str:
    url = f"{base_url}/v1/chat/completions"
    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a professional translator. "
                    "Translate the user's message faithfully. "
                    "Return only the translated text — no introductions or notes."
                ),
            },
            {"role": "user", "content": _build_prompt(text, src, tgt)},
        ],
        "temperature": 0.2,
        "max_tokens": 2048,
    }
    resp = await _get_client().post(
        url,
        json=payload,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    _raise_for_status(resp, "OpenAI")
    data = resp.json()
    return data["choices"][0]["message"]["content"].strip()


# ── Anthropic Claude ──────────────────────────────────────────────────────────

async def _translate_claude(
    api_key: str, model: str, base_url: str, anthropic_version: str,
    text: str, src: str, tgt: str
) -> str:
    url = f"{base_url}/v1/messages"
    payload = {
        "model": model,
        "max_tokens": 2048,
        "system": (
            "You are a professional translator. "
            "Translate the user's message faithfully. "
            "Return only the translated text — no introductions or notes."
        ),
        "messages": [{"role": "user", "content": _build_prompt(text, src, tgt)}],
    }
    resp = await _get_client().post(
        url,
        json=payload,
        headers={
            "x-api-key": api_key,
            "anthropic-version": anthropic_version,
            "Content-Type": "application/json",
        },
    )
    _raise_for_status(resp, "Claude")
    data = resp.json()
    content = data.get("content", [])
    if content and isinstance(content, list):
        return content[0].get("text", "").strip()
    return str(content).strip()


# ── Google Gemini ─────────────────────────────────────────────────────────────

async def _translate_gemini(
    api_key: str, model: str, base_url: str, text: str, src: str, tgt: str
) -> str:
    url = (
        f"{base_url}/v1beta/models/{model}:generateContent?key={api_key}"
    )
    system_instruction = (
        "You are a professional translator. "
        "Translate the user's message faithfully. "
        "Return only the translated text — no introductions or notes."
    )
    payload = {
        "system_instruction": {"parts": [{"text": system_instruction}]},
        "contents": [
            {"role": "user", "parts": [{"text": _build_prompt(text, src, tgt)}]}
        ],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 2048},
    }
    resp = await _get_client().post(
        url,
        json=payload,
        headers={"Content-Type": "application/json"},
    )
    _raise_for_status(resp, "Gemini")
    data = resp.json()
    try:
        return data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except (KeyError, IndexError) as exc:
        raise ValueError(f"Unexpected Gemini response shape: {data}") from exc


# ── Error helper ──────────────────────────────────────────────────────────────

def _raise_for_status(resp: httpx.Response, provider: str) -> None:
    if resp.status_code < 400:
        return
    try:
        detail = resp.json()
    except Exception:
        detail = resp.text[:300]
    raise RuntimeError(
        f"{provider} API error {resp.status_code}: {detail}"
    )


# ── Public entrypoint ─────────────────────────────────────────────────────────

async def translate_via_api(
    provider: str,
    api_key: str,
    model: str | None,
    text: str,
    src: str,
    tgt: str,
) -> str:
    """
    Translate `text` from ISO `src` to `tgt` using an external LLM API.

    Parameters
    ----------
    provider:  "openai" | "claude" | "gemini"
    api_key:   Bearer / API key from the Settings UI.
    model:     Model slug, or None to use the provider default.
    text:      Transcript text to translate.
    src:       ISO 639-1 source language (e.g. "es").
    tgt:       ISO 639-1 target language (e.g. "en").

    Returns
    -------
    Translated text string.
    """
    if provider not in VALID_PROVIDERS:
        raise ValueError(
            f"Unknown translation provider {provider!r}. "
            f"Choose from: {sorted(VALID_PROVIDERS)}"
        )

    defaults = PROVIDER_DEFAULTS[provider]
    resolved_model = model or defaults["model"]
    base_url = defaults["base_url"]

    logger.info(
        "[LLM Translate] %s/%s: %s → %s (%d chars)",
        provider, resolved_model, src, tgt, len(text),
    )

    if provider == "openai":
        return await _translate_openai(api_key, resolved_model, base_url, text, src, tgt)

    if provider == "claude":
        return await _translate_claude(
            api_key, resolved_model, base_url,
            defaults["anthropic_version"], text, src, tgt
        )

    # provider == "gemini"
    return await _translate_gemini(api_key, resolved_model, base_url, text, src, tgt)
