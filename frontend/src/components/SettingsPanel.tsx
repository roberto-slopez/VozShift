import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  X, Loader2, CheckCircle2, AlertCircle, Brain,
  RefreshCw, ChevronDown, Cpu, Volume2,
} from 'lucide-react'
import { changeModel } from '../lib/api'
import {
  sourceLangsForEngine,
  targetOptions,
  type Engine,
} from '../lib/languages'

// ── Types ────────────────────────────────────────────────────────────────────

export interface Settings {
  modelSize: string
  engine: Engine
  sourceLang: string
  targetLang: string
}

interface Props {
  open: boolean
  settings: Settings
  onClose: () => void
  onSettingsChange: (next: Settings) => void
}

// ── Whisper model catalogue ───────────────────────────────────────────────────

interface ModelInfo {
  size: string; params: string; vram: string; speed: string; description: string
}
const MODELS: ModelInfo[] = [
  { size: 'tiny',   params: '39 M',   vram: '~1 GB',  speed: 'Fastest',  description: 'Great for quick tests or low-resource machines.' },
  { size: 'base',   params: '74 M',   vram: '~1 GB',  speed: 'Fast',     description: 'Good starting point if tiny feels too rough.' },
  { size: 'small',  params: '244 M',  vram: '~2 GB',  speed: 'Moderate', description: 'Default. Best balance of speed and accuracy.' },
  { size: 'medium', params: '769 M',  vram: '~5 GB',  speed: 'Slow',     description: 'Use when accuracy matters more than latency.' },
  { size: 'large',  params: '1550 M', vram: '~10 GB', speed: 'Slowest',  description: 'Requires a powerful GPU. Near-human accuracy.' },
]

type ChangeStatus = 'idle' | 'loading' | 'success' | 'error'

// ── Reusable select dropdown ──────────────────────────────────────────────────

function LangSelect({
  label, value, options, onChange, disabled,
}: {
  label: string
  value: string
  options: Record<string, string>
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const selectRef = useRef<HTMLSelectElement>(null)
  return (
    <label className="block">
      <span className="text-[11px] text-white/40 uppercase tracking-wider mb-1 block">{label}</span>
      <div className="relative">
        <select
          ref={selectRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          className={clsx(
            'w-full appearance-none rounded-xl px-3.5 py-2.5 pr-8 text-sm border',
            'bg-white/4 border-white/10 text-white/80',
            'focus:outline-none focus:border-violet-500/50 focus:bg-white/6',
            'disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
          )}
        >
          {Object.entries(options).map(([code, name]) => (
            <option key={code} value={code} className="bg-[#13131b]">{name}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-white/30 pointer-events-none" />
      </div>
    </label>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function SettingsPanel({ open, settings, onClose, onSettingsChange }: Props) {
  const [modelStatus,   setModelStatus]   = useState<ChangeStatus>('idle')
  const [modelError,    setModelError]    = useState<string | null>(null)
  const [pendingModel,  setPendingModel]  = useState(settings.modelSize)

  useEffect(() => { setPendingModel(settings.modelSize) }, [settings.modelSize])

  // ── Helpers ──────────────────────────────────────────────────────────────

  function changeEngine(engine: Engine) {
    const langs = sourceLangsForEngine(engine)
    const sourceLang = settings.sourceLang in langs ? settings.sourceLang : 'es'
    // Keep existing target if it's still valid (same or English); otherwise default to English
    const targetLang = settings.targetLang === sourceLang || settings.targetLang === 'en'
      ? settings.targetLang
      : 'en'
    onSettingsChange({ ...settings, engine, sourceLang, targetLang })
  }

  function changeSourceLang(sourceLang: string) {
    const targetLang =
      settings.engine === 'qwen3-asr'
        ? sourceLang
        : settings.targetLang === sourceLang
        ? sourceLang
        : 'en'
    onSettingsChange({ ...settings, sourceLang, targetLang })
  }

  function changeTargetLang(targetLang: string) {
    onSettingsChange({ ...settings, targetLang })
  }

  async function applyModel() {
    if (pendingModel === settings.modelSize) return
    setModelStatus('loading')
    setModelError(null)
    try {
      await changeModel(pendingModel)
      onSettingsChange({ ...settings, modelSize: pendingModel })
      setModelStatus('success')
      setTimeout(() => setModelStatus('idle'), 2500)
    } catch (err) {
      setModelError(err instanceof Error ? err.message : 'Failed to change model.')
      setModelStatus('error')
    }
  }

  if (!open) return null

  const sourceLangs = sourceLangsForEngine(settings.engine)
  const targetLangs = targetOptions(settings.engine, settings.sourceLang)

  const currentModel = MODELS.find(m => m.size === pendingModel)

  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0 z-20 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <aside
        className="absolute inset-y-0 right-0 z-30 w-80 flex flex-col bg-[#12121a]/96 border-l border-white/8 shadow-2xl animate-slide-in-right backdrop-blur-xl"
        role="dialog"
        aria-label="Settings"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/6">
          <h2 className="text-sm font-semibold text-white/80 tracking-tight">Settings</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/40 hover:text-white/80 hover:bg-white/8 transition-colors"
            aria-label="Close settings"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-7">

          {/* ── Engine selector ─────────────────────────────────────────────── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Cpu className="size-4 text-violet-400" />
              <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">STT Engine</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(['whisper', 'qwen3-asr'] as Engine[]).map(eng => (
                <button
                  key={eng}
                  onClick={() => changeEngine(eng)}
                  className={clsx(
                    'rounded-xl px-3 py-2.5 text-xs font-medium border transition-all text-left',
                    settings.engine === eng
                      ? 'bg-violet-600/25 border-violet-500/50 text-violet-200'
                      : 'bg-white/3 border-white/6 text-white/50 hover:bg-white/6 hover:text-white/75',
                  )}
                >
                  <div className="font-semibold">{eng === 'whisper' ? 'Whisper' : 'Qwen3-ASR'}</div>
                  <div className="opacity-55 mt-0.5">{eng === 'whisper' ? 'OpenAI · translate' : '0.6B · transcribe'}</div>
                </button>
              ))}
            </div>

            {settings.engine === 'qwen3-asr' && (
              <p className="mt-2.5 text-[11px] text-sky-400/60 leading-relaxed">
                Qwen3-ASR transcribes speech, then <strong className="text-sky-400">NLLB-200</strong> translates when target ≠ source. Qwen loads at startup; NLLB loads on first translation.
              </p>
            )}
          </section>

          {/* ── Languages ──────────────────────────────────────────────────── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm">🌐</span>
              <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">Languages</span>
            </div>

            <div className="space-y-3">
              <LangSelect
                label="You speak (source)"
                value={settings.sourceLang}
                options={sourceLangs}
                onChange={changeSourceLang}
              />

              <LangSelect
                label="Output language"
                value={settings.targetLang}
                options={targetLangs}
                onChange={changeTargetLang}
              />

              {settings.sourceLang !== settings.targetLang ? (
                <p className="text-[11px] text-sky-400/70">
                  {settings.engine === 'whisper'
                    ? <>Whisper will <strong>translate</strong> natively.</>
                    : <>Qwen3-ASR transcribes → <strong>NLLB</strong> translates to English.</>
                  }
                </p>
              ) : (
                <p className="text-[11px] text-white/30">
                  Transcription only — no translation applied.
                </p>
              )}
            </div>
          </section>

          {/* ── Whisper model size (only for Whisper engine) ────────────────── */}
          {settings.engine === 'whisper' && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Brain className="size-4 text-violet-400" />
                <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">Whisper Model Size</span>
              </div>

              <div className="space-y-1.5">
                {MODELS.map(m => (
                  <button
                    key={m.size}
                    onClick={() => setPendingModel(m.size)}
                    className={clsx(
                      'w-full text-left rounded-xl px-3.5 py-2.5 border transition-all',
                      pendingModel === m.size
                        ? 'bg-violet-600/20 border-violet-500/50 text-white'
                        : 'bg-white/3 border-white/6 text-white/60 hover:bg-white/6 hover:text-white/80',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium capitalize">{m.size}</span>
                      <span className={clsx(
                        'text-[10px] font-mono px-1.5 py-0.5 rounded-md',
                        pendingModel === m.size ? 'bg-violet-500/25 text-violet-300' : 'bg-white/6 text-white/35',
                      )}>
                        {m.params}
                      </span>
                    </div>
                    <div className="flex gap-3 mt-0.5 text-[11px] opacity-60">
                      <span>{m.vram}</span>
                      <span>·</span>
                      <span>{m.speed}</span>
                    </div>
                  </button>
                ))}
              </div>

              {currentModel && (
                <p className="mt-3 text-[12px] text-white/35 leading-relaxed px-1">{currentModel.description}</p>
              )}

              {pendingModel !== settings.modelSize && (
                <button
                  onClick={applyModel}
                  disabled={modelStatus === 'loading'}
                  className={clsx(
                    'mt-3 w-full flex items-center justify-center gap-2 rounded-xl py-2 text-sm font-medium transition-all border',
                    modelStatus === 'loading'
                      ? 'bg-violet-700/30 border-violet-600/30 text-violet-400 cursor-not-allowed'
                      : 'bg-violet-600/30 border-violet-500/40 text-violet-300 hover:bg-violet-600/50',
                  )}
                >
                  {modelStatus === 'loading'
                    ? <><Loader2 className="size-4 animate-spin" /> Loading model…</>
                    : <><RefreshCw className="size-4" /> Apply — switch to {pendingModel}</>}
                </button>
              )}
              {modelStatus === 'success' && (
                <p className="mt-2 flex items-center gap-1.5 text-[12px] text-emerald-400">
                  <CheckCircle2 className="size-3.5" /> Model switched to <strong>{settings.modelSize}</strong>
                </p>
              )}
              {modelStatus === 'error' && modelError && (
                <p className="mt-2 flex items-start gap-1.5 text-[12px] text-red-400">
                  <AlertCircle className="size-3.5 mt-0.5 shrink-0" />{modelError}
                </p>
              )}
            </section>
          )}

          {/* ── Speech synthesis ──────────────────────────────────────────── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Volume2 className="size-4 text-sky-400" />
              <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">Speech (Kokoro TTS)</span>
            </div>
            <p className="text-[12px] text-white/30 mb-3 leading-relaxed">
              Output speech uses <strong className="text-white/55 font-medium">Kokoro-82M</strong> with preset voices per language (no reference audio cloning at runtime). Tune voices on the server with{' '}
              <code className="text-white/45 text-[11px] bg-white/6 px-1 py-0.5 rounded">KOKORO_VOICE_*</code>,{' '}
              <code className="text-white/45 text-[11px] bg-white/6 px-1 py-0.5 rounded">KOKORO_SPEED</code>,{' '}
              etc. Voice IDs match the upstream{' '}
              <a
                href="https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-400/90 hover:text-sky-300 underline underline-offset-2"
              >
                VOICES.md
              </a>
              {' '}catalog.
            </p>
            <p className="text-[12px] text-white/22 leading-relaxed">
              On Windows, install <strong className="text-white/35 font-medium">espeak-ng</strong> for consistent multilingual pronunciation (recommended by Kokoro).
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/6 text-[11px] text-white/20 text-center">
          Settings apply to the next recording turn
        </div>
      </aside>
    </>
  )
}
