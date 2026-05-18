# VozShift

Real-time Spanish → English voice chat.  Speak Spanish into your mic; VozShift
transcribes, translates, and responds with synthesised English speech — all
streamed live in the browser.

```
┌─────────────┐    WebSocket /ws/session    ┌──────────────────────────────┐
│  React/Vite │  ─── audio chunks ──────►  │ FastAPI                       │
│  (port 5173)│  ◄── status + text + PCM ─  │ Whisper/Qwen ASR + Kokoro TTS │
└─────────────┘                             └──────────────────────────────┘
```

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

py -m pip install -r .\backend\requirements.txt

# First run downloads model weights for ASR, translation (NLLB), and Kokoro TTS
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --app-dir .\backend
```

Wait until you see:
```
[STT] Qwen3-ASR ready ...
[TTS] Kokoro-82M ready ...
```

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

---

## Project structure

```
VozShift/
├── main.py                  ← Original CLI (preserved)
├── backend/
│   ├── app/
│   │   ├── main.py          ← FastAPI app + CORS + lifespan model loading
│   │   ├── ws.py            ← WebSocket session state machine
│   │   ├── pipeline.py      ← Orchestrates transcode→STT→stream→TTS
│   │   ├── transcoder.py    ← webm/opus → PCM 16 kHz (ffmpeg subprocess)
│   │   ├── stt.py           ← Whisper wrapper (task="translate")
│   │   ├── tts.py           ← Kokoro-82M TTS + streamed PCM helpers
│   │   └── protocol.py      ← Pydantic message models
│   └── requirements.txt
└── frontend/
    └── src/
        ├── App.tsx           ← Main orchestration
        ├── components/       ← MicButton, ChatPane, MessageBubble, StatusBar, ErrorToast
        ├── hooks/            ← useRecorder, useWebSocket, useHotkey, useAudioPlayer
        └── lib/              ← protocol.ts (types), nanoid.ts
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
