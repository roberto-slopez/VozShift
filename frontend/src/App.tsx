import { useCallback, useEffect, useRef, useState } from 'react'
import { Settings } from 'lucide-react'
import clsx from 'clsx'
import { nanoid } from './lib/nanoid'
import { fetchCurrentModel } from './lib/api'
import { WHISPER_LANGUAGES, QWEN_LANGUAGES } from './lib/languages'
import { useRecorder } from './hooks/useRecorder'
import { useWebSocket } from './hooks/useWebSocket'
import { useHotkey } from './hooks/useHotkey'
import { useAudioPlayer } from './hooks/useAudioPlayer'
import { ChatPane } from './components/ChatPane'
import { MicButton, type MicState } from './components/MicButton'
import { StatusBar } from './components/StatusBar'
import { ErrorToast } from './components/ErrorToast'
import { SettingsPanel, type Settings as AppSettings } from './components/SettingsPanel'
import type { Message } from './components/MessageBubble'
import type { AudioMeta, ServerMessage, Stage } from './lib/protocol'

const DEFAULT_SETTINGS: AppSettings = {
  modelSize: 'small',
  engine: 'qwen3-asr',   // default: Qwen3-ASR (loaded on startup)
  sourceLang: 'es',      // speak Spanish
  targetLang: 'en',      // output English (via NLLB translation after Qwen ASR)
}

export default function App() {
  const [messages,      setMessages]      = useState<Message[]>([])
  const [micState,      setMicState]      = useState<MicState>('idle')
  const [stage,         setStage]         = useState<Stage | null>(null)
  const [statusMsg,     setStatusMsg]     = useState('')
  const [error,         setError]         = useState<string | null>(null)
  const [settingsOpen,  setSettingsOpen]  = useState(false)
  const [appSettings,   setAppSettings]   = useState<AppSettings>(DEFAULT_SETTINGS)

  // Track active message IDs and pending audio metadata
  const activeBotId      = useRef<string | null>(null)
  const activeUserId     = useRef<string | null>(null)
  const pendingAudioMeta = useRef<AudioMeta | null>(null)

  // Sync whisper model size from backend on mount (in case backend uses different size)
  useEffect(() => {
    fetchCurrentModel()
      .then(size => setAppSettings(s => ({ ...s, modelSize: size })))
      .catch(() => { /* backend not up yet – use defaults */ })
  }, [])

  // ── Audio player ──────────────────────────────────────────────────────────
  const { onAudioMeta, onAudioChunk, onAudioEnd, drainRecording } = useAudioPlayer()

  // ── WebSocket message handler ─────────────────────────────────────────────
  const handleServerMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case 'status': {
        setStage(msg.stage)
        setStatusMsg(msg.message)
        break
      }

      case 'transcript_delta': {
        const botId = activeBotId.current
        if (!botId) {
          const newId = nanoid()
          activeBotId.current = newId
          setMessages(prev => [
            ...prev,
            { id: newId, role: 'bot', text: msg.text, streaming: true },
          ])
        } else {
          setMessages(prev =>
            prev.map(m => m.id === botId ? { ...m, text: m.text + msg.text } : m),
          )
        }
        break
      }

      case 'transcript_final': {
        const botId = activeBotId.current
        if (botId) {
          setMessages(prev =>
            prev.map(m => m.id === botId ? { ...m, text: msg.text, streaming: false } : m),
          )
        }
        break
      }

      case 'audio_meta': {
        pendingAudioMeta.current = msg
        onAudioMeta(msg)
        break
      }

      case 'audio_end': {
        onAudioEnd()
        const botId = activeBotId.current
        const audio = drainRecording()
        if (botId && audio) {
          setMessages(prev =>
            prev.map(m =>
              m.id === botId
                ? { ...m, audioData: audio, audioSampleRate: pendingAudioMeta.current?.sampleRate ?? 44100 }
                : m,
            ),
          )
        }
        activeBotId.current = null
        pendingAudioMeta.current = null
        setMicState('idle')
        setStage(null)
        setStatusMsg('')
        break
      }

      case 'error': {
        setError(`[${msg.code}] ${msg.message}`)
        activeBotId.current = null
        setMicState('idle')
        setStage(null)
        break
      }
    }
  }, [onAudioMeta, onAudioEnd, drainRecording])

  const handleBinary = useCallback((data: ArrayBuffer) => {
    onAudioChunk(data)
  }, [onAudioChunk])

  // ── WebSocket ─────────────────────────────────────────────────────────────
  const { status: wsStatus, sendJson, sendBinary } = useWebSocket(
    handleServerMessage,
    handleBinary,
  )

  // ── Recorder ──────────────────────────────────────────────────────────────
  const recorder = useRecorder()

  const handleStartRecording = useCallback(async () => {
    if (wsStatus !== 'connected') {
      setError('WebSocket is not connected. Please wait and try again.')
      return
    }
    if (micState !== 'idle') return

    const userId = nanoid()
    activeUserId.current = userId
    setMessages(prev => [
      ...prev,
      { id: userId, role: 'user', text: '🎙️ Recording…', streaming: true },
    ])
    setMicState('recording')
    setStage('recording')
    setStatusMsg('Recording started.')

    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'

    sendJson({
      type: 'start',
      mime,
      sampleRate: 48000,
      engine: appSettings.engine,
      sourceLang: appSettings.sourceLang,
      targetLang: appSettings.targetLang,
    })

    await recorder.start((blob) => {
      blob.arrayBuffer().then(ab => sendBinary(ab))
    })
  }, [wsStatus, micState, sendJson, sendBinary, recorder, appSettings])

  const handleStopRecording = useCallback(() => {
    recorder.stop()

    const userId = activeUserId.current
    if (userId) {
      setMessages(prev =>
        prev.map(m =>
          m.id === userId ? { ...m, text: '🎤 Sent audio', streaming: false } : m,
        ),
      )
      activeUserId.current = null
    }

    sendJson({ type: 'stop' })
    setMicState('processing')
    setStage('received')
    setStatusMsg('Sending audio…')
  }, [recorder, sendJson])

  // ── Hotkey ────────────────────────────────────────────────────────────────
  const { handlers } = useHotkey(
    handleStartRecording,
    handleStopRecording,
    micState === 'idle' || micState === 'recording',
  )

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto border-x border-white/6 relative overflow-hidden">

      {/* Header */}
      <header className="flex items-center gap-3 px-5 py-3.5 border-b border-white/6 bg-white/2 backdrop-blur-sm shrink-0">
        <span className="text-lg">🎙️</span>
        <div>
          <h1 className="text-sm font-semibold text-white/85 tracking-tight leading-tight">VozShift</h1>
          <p className="text-[10px] text-white/30 leading-tight">Spanish → English</p>
        </div>

        {/* Language pair pill */}
        {(() => {
          const langs = appSettings.engine === 'whisper' ? WHISPER_LANGUAGES : QWEN_LANGUAGES
          const src = langs[appSettings.sourceLang] ?? appSettings.sourceLang
          const tgt = langs[appSettings.targetLang] ?? appSettings.targetLang
          const samelang = appSettings.sourceLang === appSettings.targetLang
          return (
            <span className="ml-2 hidden sm:inline text-[11px] text-white/40 bg-white/5 border border-white/8 rounded-full px-2.5 py-0.5 shrink-0">
              {src}{samelang ? '' : ` → ${tgt}`}
            </span>
          )
        })()}

        {/* Engine + model pill */}
        <span className="ml-auto text-[11px] text-violet-400/60 bg-violet-500/8 border border-violet-500/15 rounded-full px-2.5 py-0.5 shrink-0">
          {appSettings.engine === 'whisper'
            ? `whisper/${appSettings.modelSize}`
            : 'qwen3-asr'}
        </span>

        {/* Settings button */}
        <button
          onClick={() => setSettingsOpen(s => !s)}
          className={clsx(
            'p-2 rounded-xl transition-all border',
            settingsOpen
              ? 'bg-violet-600/25 border-violet-500/40 text-violet-300'
              : 'border-transparent text-white/35 hover:text-white/70 hover:bg-white/6',
          )}
          aria-label="Open settings"
        >
          <Settings className="size-4" />
        </button>
      </header>

      {/* Chat */}
      <ChatPane messages={messages} />

      {/* Mic button */}
      <div className="flex justify-center py-4 border-t border-white/6 bg-white/1 backdrop-blur-sm shrink-0">
        <MicButton
          micState={micState}
          handlers={handlers}
          disabled={wsStatus !== 'connected' || micState === 'processing'}
        />
      </div>

      {/* Status bar */}
      <StatusBar stage={stage} message={statusMsg} wsStatus={wsStatus} />

      {/* Settings panel (absolute overlay within the container) */}
      <SettingsPanel
        open={settingsOpen}
        settings={appSettings}
        onClose={() => setSettingsOpen(false)}
        onSettingsChange={setAppSettings}
      />

      {/* Error toast */}
      <ErrorToast message={error} onDismiss={() => setError(null)} />
    </div>
  )
}
