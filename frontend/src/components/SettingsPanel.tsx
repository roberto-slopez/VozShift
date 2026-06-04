import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  X, Loader2, CheckCircle2, AlertCircle, Brain, Mic2,
  RefreshCw, ChevronDown, Cpu, Volume2, Globe, Key, Bot,
} from 'lucide-react'
import { changeModel, fetchAudioPrompts } from '../lib/api'
import {
  sourceLangsForEngine,
  targetOptions,
  type Engine,
} from '../lib/languages'
import type { TtsEngine, TranslationProvider } from '../lib/protocol'

// ── Types ────────────────────────────────────────────────────────────────────

export interface Settings {
  modelSize: string
  engine: Engine
  sourceLang: string
  targetLang: string
  ttsEngine: TtsEngine
  voiceFile: string | null
  translationProvider: TranslationProvider
  apiKey: string
  apiModel: string
}

interface Props {
  open: boolean
  settings: Settings
  onClose: () => void
  onSettingsChange: (next: Settings) => void
}

// ── Whisper model catalogue ────────────────────────────────────────────────

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

// ── Translation providers ──────────────────────────────────────────────────

const PROVIDERS: { id: TranslationProvider; label: string; hint: string }[] = [
  { id: 'local',   label: 'Local',   hint: 'NLLB-200 (Qwen) or Whisper built-in translate. No API key needed.' },
  { id: 'openai',  label: 'OpenAI',  hint: 'Uses GPT to translate your transcript. Default model: gpt-4o-mini.' },
  { id: 'claude',  label: 'Claude',  hint: 'Uses Anthropic Claude. Default: claude-3-5-haiku-latest.' },
  { id: 'gemini',  label: 'Gemini',  hint: 'Uses Google Gemini. Default: gemini-1.5-flash.' },
]

type ChangeStatus = 'idle' | 'loading' | 'success' | 'error'

// ── Helpers ────────────────────────────────────────────────────────────────

function SectionHeading({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {icon}
      <span
        className="text-xs font-semibold uppercase tracking-wider"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </span>
    </div>
  )
}

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
      <span
        className="text-[11px] uppercase tracking-wider mb-1 block"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </span>
      <div className="relative">
        <select
          ref={selectRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          className={clsx(
            'w-full appearance-none rounded-xl px-3.5 py-2.5 pr-8 text-sm sku-inset',
            'focus:outline-none transition-colors',
            'disabled:opacity-40 disabled:cursor-not-allowed',
          )}
          style={{ color: 'var(--text-primary)', background: 'var(--bg-sunken)' }}
        >
          {Object.entries(options).map(([code, name]) => (
            <option key={code} value={code} style={{ background: 'var(--bg-card)' }}>{name}</option>
          ))}
        </select>
        <ChevronDown
          className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 pointer-events-none"
          style={{ color: 'var(--text-muted)' }}
        />
      </div>
    </label>
  )
}

// ── Main component ────────────────────────────────────────────────────────

export function SettingsPanel({ open, settings, onClose, onSettingsChange }: Props) {
  const [modelStatus, setModelStatus] = useState<ChangeStatus>('idle')
  const [modelError,  setModelError]  = useState<string | null>(null)
  const [pendingModel, setPendingModel] = useState(settings.modelSize)
  const [audioFiles,  setAudioFiles]  = useState<string[]>([])
  const [audioLoading, setAudioLoading] = useState(false)

  useEffect(() => { setPendingModel(settings.modelSize) }, [settings.modelSize])

  useEffect(() => {
    if (!open) return
    setAudioLoading(true)
    fetchAudioPrompts()
      .then(setAudioFiles)
      .catch(() => setAudioFiles([]))
      .finally(() => setAudioLoading(false))
  }, [open])

  function changeEngine(engine: Engine) {
    const langs = sourceLangsForEngine(engine)
    const sourceLang = settings.sourceLang in langs ? settings.sourceLang : 'es'
    const targetLang = settings.targetLang === sourceLang || settings.targetLang === 'en'
      ? settings.targetLang : 'en'
    onSettingsChange({ ...settings, engine, sourceLang, targetLang })
  }

  function changeSourceLang(sourceLang: string) {
    const targetLang =
      settings.engine === 'qwen3-asr'
        ? sourceLang
        : settings.targetLang === sourceLang ? sourceLang : 'en'
    onSettingsChange({ ...settings, sourceLang, targetLang })
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
  const apiProviderSelected = settings.translationProvider !== 'local'

  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0 z-20 backdrop-blur-[2px]"
        style={{ background: 'rgba(0,0,0,0.35)' }}
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <aside
        className="absolute inset-y-0 right-0 z-30 w-80 flex flex-col animate-slide-in-right"
        style={{
          background: 'var(--bg-overlay)',
          borderLeft: '1px solid var(--border-outer)',
          boxShadow: 'var(--shadow-card)',
          backdropFilter: 'blur(16px)',
        }}
        role="dialog"
        aria-label="Settings"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 sku-raised"
          style={{ borderBottom: '1px solid var(--border-outer)' }}
        >
          <h2
            className="text-sm font-semibold tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            Settings
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 transition-colors sku-raised active:sku-press"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Close settings"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-7">

          {/* ── STT Engine ─────────────────────────────────────────────────── */}
          <section>
            <SectionHeading
              icon={<Cpu className="size-4" style={{ color: 'var(--accent)' }} />}
              label="STT Engine"
            />
            <div className="grid grid-cols-2 gap-2">
              {(['whisper', 'qwen3-asr'] as Engine[]).map(eng => (
                <button
                  key={eng}
                  onClick={() => changeEngine(eng)}
                  className={clsx(
                    'rounded-xl px-3 py-2.5 text-xs font-medium transition-all text-left',
                    settings.engine === eng ? 'sku-inset' : 'sku-raised active:sku-press',
                  )}
                  style={{
                    color: settings.engine === eng ? 'var(--accent)' : 'var(--text-secondary)',
                  }}
                >
                  <div className="font-semibold">
                    {eng === 'whisper' ? 'Whisper' : 'Qwen3-ASR'}
                  </div>
                  <div className="opacity-55 mt-0.5">
                    {eng === 'whisper' ? 'OpenAI · translate' : '0.6B · transcribe'}
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* ── Languages ─────────────────────────────────────────────────── */}
          <section>
            <SectionHeading
              icon={<Globe className="size-4" style={{ color: 'var(--color-sky)' }} />}
              label="Languages"
            />
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
                onChange={v => onSettingsChange({ ...settings, targetLang: v })}
              />
              {settings.sourceLang !== settings.targetLang ? (
                <p className="text-[11px]" style={{ color: 'var(--color-sky)' }}>
                  {settings.engine === 'whisper'
                    ? <>Whisper will <strong>translate</strong> natively.</>
                    : <>Qwen3-ASR transcribes → translation method below.</>}
                </p>
              ) : (
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  Transcription only — no translation applied.
                </p>
              )}
            </div>
          </section>

          {/* ── Translation Provider ───────────────────────────────────────── */}
          <section>
            <SectionHeading
              icon={<Bot className="size-4" style={{ color: 'var(--accent)' }} />}
              label="Translation Provider"
            />
            <div className="grid grid-cols-2 gap-2">
              {PROVIDERS.map(p => (
                <button
                  key={p.id}
                  onClick={() => onSettingsChange({ ...settings, translationProvider: p.id })}
                  title={p.hint}
                  className={clsx(
                    'rounded-xl px-3 py-2.5 text-xs font-medium transition-all text-left',
                    settings.translationProvider === p.id ? 'sku-inset' : 'sku-raised active:sku-press',
                  )}
                  style={{
                    color: settings.translationProvider === p.id ? 'var(--accent)' : 'var(--text-secondary)',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Provider hint */}
            {PROVIDERS.find(p => p.id === settings.translationProvider) && (
              <p className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {PROVIDERS.find(p => p.id === settings.translationProvider)!.hint}
              </p>
            )}

            {/* API Key + optional model (only for cloud providers) */}
            {apiProviderSelected && (
              <div className="mt-3 space-y-2">
                <label className="block">
                  <span
                    className="flex items-center gap-1 text-[11px] uppercase tracking-wider mb-1"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <Key className="size-3" />
                    API Key
                  </span>
                  <input
                    type="password"
                    autoComplete="off"
                    placeholder={`${settings.translationProvider} key…`}
                    value={settings.apiKey}
                    onChange={e => onSettingsChange({ ...settings, apiKey: e.target.value })}
                    className="w-full rounded-xl px-3.5 py-2.5 text-sm sku-inset focus:outline-none"
                    style={{ color: 'var(--text-primary)', background: 'var(--bg-sunken)' }}
                  />
                </label>
                <label className="block">
                  <span
                    className="text-[11px] uppercase tracking-wider mb-1 block"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Model override (optional)
                  </span>
                  <input
                    type="text"
                    autoComplete="off"
                    placeholder={
                      settings.translationProvider === 'openai'  ? 'gpt-4o-mini' :
                      settings.translationProvider === 'claude'  ? 'claude-3-5-haiku-latest' :
                                                                    'gemini-1.5-flash'
                    }
                    value={settings.apiModel}
                    onChange={e => onSettingsChange({ ...settings, apiModel: e.target.value })}
                    className="w-full rounded-xl px-3.5 py-2.5 text-sm sku-inset focus:outline-none"
                    style={{ color: 'var(--text-primary)', background: 'var(--bg-sunken)' }}
                  />
                </label>
                <p className="text-[11px]" style={{ color: 'var(--color-amber)' }}>
                  Key is sent per session only — never saved to disk or logs.
                </p>
              </div>
            )}
          </section>

          {/* ── TTS Engine ────────────────────────────────────────────────── */}
          <section>
            <SectionHeading
              icon={<Volume2 className="size-4" style={{ color: 'var(--color-sky)' }} />}
              label="Speech (TTS)"
            />
            <div className="grid grid-cols-2 gap-2 mb-3">
              {(['kokoro', 'xtts'] as TtsEngine[]).map(eng => (
                <button
                  key={eng}
                  onClick={() => onSettingsChange({ ...settings, ttsEngine: eng })}
                  className={clsx(
                    'rounded-xl px-3 py-2.5 text-xs font-medium transition-all text-left',
                    settings.ttsEngine === eng ? 'sku-inset' : 'sku-raised active:sku-press',
                  )}
                  style={{
                    color: settings.ttsEngine === eng ? 'var(--color-sky)' : 'var(--text-secondary)',
                  }}
                >
                  <div className="font-semibold">{eng === 'kokoro' ? 'Kokoro' : 'XTTS-v2'}</div>
                  <div className="opacity-55 mt-0.5">{eng === 'kokoro' ? 'preset · fast' : 'clone · ref WAV'}</div>
                </button>
              ))}
            </div>

            {settings.ttsEngine === 'kokoro' && (
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Kokoro-82M uses preset voices per language. Override per language with{' '}
                <code
                  className="text-[11px] px-1 py-0.5 rounded sku-inset"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  KOKORO_VOICE_*
                </code>{' '}
                env vars.
              </p>
            )}

            {settings.ttsEngine === 'xtts' && (
              <div className="space-y-2">
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  XTTS-v2 clones any voice from a reference WAV. Install{' '}
                  <code
                    className="text-[11px] px-1 py-0.5 rounded sku-inset"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    requirements-clone.txt
                  </code>{' '}
                  first. CPML license — non-commercial use only.
                </p>

                {/* Voice file picker */}
                <div>
                  <span
                    className="flex items-center gap-1 text-[11px] uppercase tracking-wider mb-1.5"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <Mic2 className="size-3" />
                    Reference voice (backend/audio/)
                  </span>
                  {audioLoading ? (
                    <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                      <Loader2 className="size-3.5 animate-spin" />
                      Loading files…
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <button
                        onClick={() => onSettingsChange({ ...settings, voiceFile: null })}
                        className={clsx(
                          'w-full text-left rounded-xl px-3.5 py-2.5 text-sm transition-all',
                          !settings.voiceFile ? 'sku-inset' : 'sku-raised active:sku-press',
                        )}
                        style={{ color: !settings.voiceFile ? 'var(--color-sky)' : 'var(--text-muted)' }}
                      >
                        <span className="font-medium">No reference</span>
                        <span className="block text-[11px] opacity-55 mt-0.5">
                          XTTS will fail — a reference WAV is required
                        </span>
                      </button>

                      {audioFiles.length === 0 && (
                        <p className="text-[12px] italic px-1 pt-1" style={{ color: 'var(--text-muted)' }}>
                          No audio files found in backend/audio/
                        </p>
                      )}

                      {audioFiles.map(file => (
                        <button
                          key={file}
                          onClick={() => onSettingsChange({ ...settings, voiceFile: file })}
                          className={clsx(
                            'w-full text-left rounded-xl px-3.5 py-2.5 text-sm transition-all truncate',
                            settings.voiceFile === file ? 'sku-inset' : 'sku-raised active:sku-press',
                          )}
                          style={{ color: settings.voiceFile === file ? 'var(--color-sky)' : 'var(--text-secondary)' }}
                          title={file}
                        >
                          {file}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* ── Whisper model size ─────────────────────────────────────────── */}
          {settings.engine === 'whisper' && (
            <section>
              <SectionHeading
                icon={<Brain className="size-4" style={{ color: 'var(--accent)' }} />}
                label="Whisper Model Size"
              />
              <div className="space-y-1.5">
                {MODELS.map(m => (
                  <button
                    key={m.size}
                    onClick={() => setPendingModel(m.size)}
                    className={clsx(
                      'w-full text-left rounded-xl px-3.5 py-2.5 transition-all',
                      pendingModel === m.size ? 'sku-inset' : 'sku-raised active:sku-press',
                    )}
                    style={{ color: pendingModel === m.size ? 'var(--accent)' : 'var(--text-secondary)' }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium capitalize">{m.size}</span>
                      <span
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded sku-inset"
                        style={{ color: 'var(--text-muted)' }}
                      >
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
                <p className="mt-3 text-[12px] px-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {currentModel.description}
                </p>
              )}

              {pendingModel !== settings.modelSize && (
                <button
                  onClick={applyModel}
                  disabled={modelStatus === 'loading'}
                  className={clsx(
                    'mt-3 w-full flex items-center justify-center gap-2 rounded-xl py-2 text-sm font-medium transition-all',
                    modelStatus === 'loading'
                      ? 'sku-inset opacity-60 cursor-not-allowed'
                      : 'sku-raised active:sku-press',
                  )}
                  style={{ color: 'var(--accent)' }}
                >
                  {modelStatus === 'loading'
                    ? <><Loader2 className="size-4 animate-spin" /> Loading model…</>
                    : <><RefreshCw className="size-4" /> Apply — switch to {pendingModel}</>}
                </button>
              )}
              {modelStatus === 'success' && (
                <p
                  className="mt-2 flex items-center gap-1.5 text-[12px]"
                  style={{ color: 'var(--color-emerald)' }}
                >
                  <CheckCircle2 className="size-3.5" />
                  Model switched to <strong>{settings.modelSize}</strong>
                </p>
              )}
              {modelStatus === 'error' && modelError && (
                <p
                  className="mt-2 flex items-start gap-1.5 text-[12px]"
                  style={{ color: 'var(--color-red)' }}
                >
                  <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
                  {modelError}
                </p>
              )}
            </section>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-5 py-3 text-[11px] text-center sku-raised"
          style={{ borderTop: '1px solid var(--border-outer)', color: 'var(--text-muted)' }}
        >
          Settings apply to the next recording turn
        </div>
      </aside>
    </>
  )
}
