# VozShift

Real-time voice interpreter with **speech recognition**, **AI translation**, and **TTS synthesis**.
Speak in one language; VozShift transcribes, translates, and responds with synthesised speech — all
streamed live in the browser with a skeuomorphic light/dark UI.

```
┌─────────────┐    WebSocket /ws/session    ┌──────────────────────────────────────┐
│  React/Vite │  ─── audio chunks ──────►  │ FastAPI                               │
│  (port 5173)│  ◄── status + text + PCM ─  │ Whisper/Qwen ASR + Kokoro/XTTS TTS   │
└─────────────┘                             │ NLLB-200 / Claude / OpenAI / Gemini   │
                                            └──────────────────────────────────────┘
```

**Key features**

| Feature | Details |
|---------|---------|
| 🎙️ **STT** | Whisper (multilingual) or Qwen3-ASR-0.6B |
| 🌐 **Translation** | Local NLLB-200 or cloud LLM (OpenAI · Claude · Gemini) |
| 🔊 **TTS** | Kokoro-82M (preset voices) or XTTS-v2 (zero-shot voice cloning) |
| 🎨 **Theme** | Skeuomorphic light + dark, auto-detects system preference |
| 🔑 **API keys** | Entered in the UI, sent per-session only — never stored on disk |

---

## Prerequisites

| Tool | Install |
|------|---------|
| **Python 3.10+** | [python.org](https://www.python.org/downloads/) |
| **FFmpeg** (in PATH) | `winget install Gyan.FFmpeg` |
| **Node.js LTS** | [nodejs.org](https://nodejs.org/) |
| **pnpm** | `npm install -g pnpm` |

> **GPU note:** ASR models (Whisper or Qwen) and Kokoro rely on PyTorch. If you have an NVIDIA
> GPU, install the CUDA build of torch *before* `requirements.txt`:
> ```powershell
> pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121
> ```
> On CPU everything still works, but expect ~2–4 s latency per turn.

---

## Quick start

### 1. Backend

```powershell
# Core dependencies (ASR + NLLB + Kokoro TTS + API translation client)
py -m pip install -r .\backend\requirements.txt

# Start the server — first run downloads model weights
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --app-dir .\backend
```

Wait until you see:
```
[STT] Qwen3-ASR ready ...
[TTS] Kokoro-82M ready ...
```

#### Optional: XTTS-v2 voice cloning

```powershell
# Install AFTER the core requirements (torch must already be installed)
py -m pip install -r .\backend\requirements-clone.txt
```

> **CPML license notice:** XTTS-v2 model weights are released under the
> [Coqui Public Model License](https://coqui.ai/cpml).
> **Non-commercial / personal / research use only.**
> By installing `requirements-clone.txt` and running the model, you agree to
> its terms. Do not use in commercial products without a commercial license.
>
> Place reference voice WAV files in `backend/audio/` and select them in
> **Settings → Speech (TTS) → XTTS-v2 → Reference voice**.

### 2. Frontend

Open a second terminal:

```powershell
cd .\frontend
pnpm install
pnpm dev
```

Open **http://localhost:5173** in Chrome or Edge.

---

## Usage

| Action | Effect |
|--------|--------|
| **Hold `Space`** (> 300 ms) or **hold button** | Hold-to-talk: release to send |
| **Tap `Space`** (< 300 ms) or **tap button** | Toggle mode: tap again to stop |
| Replay button on a bot bubble | Re-plays the TTS audio |

The status bar at the bottom shows the current pipeline stage in real time. Each stage has a **short category** (for example *Speech → text* vs *Text → speech*) and a **detailed line** from the server that names whether the step is about **raw audio**, **transcript text**, or **synthesized audio**.

> `Live input → Raw audio → Decode → Speech→text (STT) → Text (translate / chat) → Text→speech (TTS) → Done`

### Translation providers

Open **Settings → Translation Provider** to choose:

| Provider | Details |
|----------|---------|
| **Local** | NLLB-200 (Qwen path) or Whisper built-in translate. No API key required. |
| **OpenAI** | GPT-4o-mini (or any OpenAI model). Paste your key in Settings. |
| **Claude** | Anthropic Claude (claude-3-5-haiku-latest default). |
| **Gemini** | Google Gemini (gemini-1.5-flash default). |

API keys are **session-only** — they are held in memory for the duration of the WebSocket connection and never written to disk or server logs. Close the tab to clear them. Do not share keys in shared environments.

### Theming

Click the ☀️/🌙 button in the header to toggle between the **light** (embossed parchment) and **dark** (deep engraved) skeuomorphic themes. The selection is persisted to `localStorage`.

---

## Project structure

```
VozShift/
├── main.py                       ← Original CLI (preserved)
├── backend/
│   ├── app/
│   │   ├── main.py               ← FastAPI app + CORS + lifespan + GET /providers
│   │   ├── ws.py                 ← WebSocket session state machine (start/stop/cancel)
│   │   ├── pipeline.py           ← Orchestrates transcode→STT→translate→stream→TTS
│   │   ├── transcoder.py         ← webm/opus → PCM 16 kHz (ffmpeg subprocess)
│   │   ├── stt.py                ← Whisper/Qwen ASR wrapper
│   │   ├── tts.py                ← Kokoro-82M TTS + streamed PCM helpers
│   │   ├── tts_clone.py          ← XTTS-v2 voice cloning wrapper (lazy import)
│   │   ├── translator.py         ← NLLB-200 local translation
│   │   ├── llm_translator.py     ← OpenAI / Claude / Gemini API translation
│   │   └── protocol.py           ← Pydantic message models
│   ├── audio/                    ← Reference voice WAVs for XTTS (add your own)
│   ├── requirements.txt          ← Core dependencies (includes httpx)
│   └── requirements-clone.txt    ← Optional XTTS-v2 deps (coqui-tts)
└── frontend/
    └── src/
        ├── App.tsx               ← Main orchestration + theme toggle
        ├── components/           ← MicButton, ChatPane, MessageBubble, StatusBar,
        │                            ErrorToast, SettingsPanel
        ├── hooks/                ← useRecorder, useWebSocket, useHotkey,
        │                            useAudioPlayer, useTheme
        └── lib/                  ← protocol.ts (types), api.ts, languages.ts, nanoid.ts
```

---

## Troubleshooting

### `FFmpeg not found`
Make sure `ffmpeg` is in your PATH after installing with winget:
```powershell
ffmpeg -version
```
If missing, restart your terminal (winget updates PATH for new sessions only).

### `CUDA out of memory`
Reduce Whisper model size in `backend/app/stt.py`: change `"small"` to `"base"` or `"tiny"`.

### `MediaRecorder: audio/webm;codecs=opus not supported`
Firefox does not support `webm/opus` in all versions. Use Chrome or Edge.

### WebSocket stays `connecting`
Make sure the backend is running on port 8000 *before* opening the frontend.
The frontend will retry with exponential backoff up to 6 times.

### XTTS-v2 `CloneTTSUnavailable` error

You selected XTTS-v2 but `requirements-clone.txt` has not been installed. Run:
```powershell
py -m pip install -r .\backend\requirements-clone.txt
```
Then restart the backend. If you hit dependency conflicts with `qwen-asr`/`transformers`,
create a separate venv for cloning:
```powershell
py -m venv clone-venv
clone-venv\Scripts\Activate.ps1
py -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121
py -m pip install -r .\backend\requirements-clone.txt
```

### API key rejected / translation error

Check **Settings → Translation Provider** and confirm:
1. The correct provider is selected.
2. The key is valid and not expired.
3. Your account has credits / quota remaining.

The error message will include the HTTP status code and the API's error detail.

### Kokoro pronunciation issues on Windows

Kokoro’s multilingual grapheme-to-phone layer expects **espeak-ng** on your PATH ([install guidance](https://github.com/espeak-ng/espeak-ng)). Without it you may hear poor quality for non-English text.

### First model downloads are slow

The first startup can pull multi-gigabyte ASR checkpoints (depending on configuration). Subsequent starts load from the local cache (`~/.cache/huggingface/` on Windows).

---

## License

This project is released under the [MIT License](LICENSE).

## Code of conduct

Participation is governed by the [Contributor Covenant](CODE_OF_CONDUCT.md). Please read it before opening issues or pull requests.

## Documentation site (GitHub Pages)

The README is published as a static site with [GitHub Actions](.github/workflows/pages.yml). In the repository go to **Settings → Pages → Build and deployment**, choose **GitHub Actions** as the source, then push to `main` (or run the workflow manually). The site URL appears under **Settings → Pages** and in the workflow summary.
