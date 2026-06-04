import { useCallback, useEffect, useRef, useState } from 'react'
import { Settings, Sun, Moon } from 'lucide-react'
import clsx from 'clsx'
import { nanoid } from './lib/nanoid'
import { fetchCurrentModel } from './lib/api'
import { WHISPER_LANGUAGES, QWEN_LANGUAGES } from './lib/languages'
import { useRecorder } from './hooks/useRecorder'
import { useWebSocket } from './hooks/useWebSocket'
import { useHotkey } from './hooks/useHotkey'
import { useAudioPlayer } from './hooks/useAudioPlayer'
import { useTheme } from './hooks/useTheme'
import { ChatPane } from './components/ChatPane'
import { MicButton, type MicState } from './components/MicButton'
import { StatusBar } from './components/StatusBar'
import { ErrorToast } from './components/ErrorToast'
import { SettingsPanel, type Settings as AppSettings } from './components/SettingsPanel'
import type { Message } from './components/MessageBubble'
import type { AudioMeta, ServerMessage, Stage } from './lib/protocol'

const DEFAULT_SETTINGS: AppSettings = {
  modelSize: 'small',
  engine: 'qwen3-asr',
  sourceLang: 'es',
  targetLang: 'en',
  ttsEngine: 'kokoro',
  voiceFile: null,
  translationProvider: 'local',
  apiKey: '',
  apiModel: '',
}

export default function App() {
  const [messages,      setMessages]      = useState<Message[]>([])
  const [micState,      setMicState]      = useState<MicState>('idle')
  const [stage,         setStage]         = useState<Stage | null>(null)
  const [statusMsg,     setStatusMsg]     = useState('')
  const [error,         setError]         = useState<string | null>(null)
  const [settingsOpen,  setSettingsOpen]  = useState(false)
  const [appSettings,   setAppSettings]   = useState<AppSettings>(DEFAULT_SETTINGS)

  const activeBotId      = useRef<string | null>(null)
  const activeUserId     = useRef<string | null>(null)
  const pendingAudioMeta = useRef<AudioMeta | null>(null)

  const { theme, toggle: toggleTheme } = useTheme()

  useEffect(() => {
    fetchCurrentModel()
      .then(size => setAppSettings(s => ({ ...s, modelSize: size })))
      .catch(() => {})
  }, [])

  const { onAudioMeta, onAudioChunk, onAudioEnd, drainRecording } = useAudioPlayer()

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

  const { status: wsStatus, sendJson, sendBinary } = useWebSocket(
    handleServerMessage,
    handleBinary,
  )

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
      ttsEngine: appSettings.ttsEngine,
      voiceFile: appSettings.voiceFile || null,
      translationProvider: appSettings.translationProvider,
      apiKey: appSettings.apiKey || null,
      apiModel: appSettings.apiModel || null,
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

  const { handlers } = useHotkey(
    handleStartRecording,
    handleStopRecording,
    micState === 'idle' || micState === 'recording',
  )

  const langs = appSettings.engine === 'whisper' ? WHISPER_LANGUAGES : QWEN_LANGUAGES
  const srcLabel = langs[appSettings.sourceLang] ?? appSettings.sourceLang
  const tgtLabel = langs[appSettings.targetLang] ?? appSettings.targetLang
  const sameLang = appSettings.sourceLang === appSettings.targetLang

  return (
    <div
      className="flex flex-col h-full max-w-2xl mx-auto relative overflow-hidden"
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      {/* Header */}
      <header
        className="flex items-center gap-3 px-5 py-3.5 shrink-0 sku-raised"
        style={{ borderBottom: '1px solid var(--border-outer)' }}
      >
        {/* Logo pill */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-full sku-inset"
        >
          <span className="text-base">🎙️</span>
          <div>
            <h1
              className="text-sm font-bold tracking-tight leading-tight"
              style={{ color: 'var(--text-primary)' }}
            >
              VozShift
            </h1>
            <p className="text-[10px] leading-tight" style={{ color: 'var(--text-muted)' }}>
              Voice interpreter
            </p>
          </div>
        </div>

        {/* Language pair pill */}
        <span
          className="hidden sm:inline text-[11px] px-2.5 py-1 rounded-full sku-raised"
          style={{ color: 'var(--text-secondary)' }}
        >
          {srcLabel}{sameLang ? '' : ` → ${tgtLabel}`}
        </span>

        {/* Engine pill */}
        <span
          className="ml-auto text-[11px] px-2.5 py-1 rounded-full sku-inset font-mono"
          style={{ color: 'var(--accent)' }}
        >
          {appSettings.engine === 'whisper'
            ? `whisper/${appSettings.modelSize}`
            : 'qwen3-asr'}
        </span>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className={clsx('p-2 rounded-xl transition-all sku-raised active:sku-press')}
          style={{ color: 'var(--text-secondary)' }}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          title={`${theme === 'dark' ? 'Light' : 'Dark'} theme`}
        >
          {theme === 'dark'
            ? <Sun className="size-4" />
            : <Moon className="size-4" />}
        </button>

        {/* Settings button */}
        <button
          onClick={() => setSettingsOpen(s => !s)}
          className={clsx(
            'p-2 rounded-xl transition-all',
            settingsOpen ? 'sku-inset' : 'sku-raised active:sku-press',
          )}
          style={{ color: settingsOpen ? 'var(--accent)' : 'var(--text-secondary)' }}
          aria-label="Open settings"
        >
          <Settings className="size-4" />
        </button>
      </header>

      {/* Chat */}
      <ChatPane messages={messages} />

      {/* Mic button row */}
      <div
        className="flex justify-center py-4 shrink-0 sku-raised"
        style={{ borderTop: '1px solid var(--border-outer)' }}
      >
        <MicButton
          micState={micState}
          handlers={handlers}
          disabled={wsStatus !== 'connected' || micState === 'processing'}
        />
      </div>

      {/* Status bar */}
      <StatusBar stage={stage} message={statusMsg} wsStatus={wsStatus} />

      {/* Settings panel */}
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
