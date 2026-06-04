import clsx from 'clsx'
import type { ReactNode } from 'react'
import {
  Loader2, Mic, AudioLines, FileText, Languages, Volume2,
  CheckCircle2, Wifi, WifiOff,
} from 'lucide-react'
import type { Stage } from '../lib/protocol'
import type { WsStatus } from '../hooks/useWebSocket'

interface Props {
  stage: Stage | null
  message: string
  wsStatus: WsStatus
}

const STAGE_META: Record<Stage, { icon: ReactNode; category: string; fallback: string }> = {
  recording: {
    icon: <Mic className="size-4" style={{ color: 'var(--color-red)' }} />,
    category: 'Live input',
    fallback: 'Listening to the microphone…',
  },
  received: {
    icon: <AudioLines className="size-4" style={{ color: 'var(--color-sky)' }} />,
    category: 'Raw audio',
    fallback: 'Recording bytes received.',
  },
  transcoding: {
    icon: <Loader2 className="size-4 animate-spin" style={{ color: 'var(--color-sky)' }} />,
    category: 'Decode',
    fallback: 'Normalizing audio for the recognizer.',
  },
  transcribing: {
    icon: <FileText className="size-4" style={{ color: 'var(--color-violet)' }} />,
    category: 'Speech → text',
    fallback: 'Recognizing speech (STT).',
  },
  translating: {
    icon: <Languages className="size-4" style={{ color: 'var(--color-violet)' }} />,
    category: 'Text',
    fallback: 'Translating or streaming reply text.',
  },
  synthesizing: {
    icon: <Volume2 className="size-4" style={{ color: 'var(--color-amber)' }} />,
    category: 'Text → speech',
    fallback: 'Generating the spoken reply (TTS).',
  },
  done: {
    icon: <CheckCircle2 className="size-4" style={{ color: 'var(--color-emerald)' }} />,
    category: 'Done',
    fallback: 'This turn finished.',
  },
}

export function StatusBar({ stage, message, wsStatus }: Props) {
  const meta = stage ? STAGE_META[stage] : null

  return (
    <div
      className="flex items-start gap-3 px-4 py-2.5 border-t text-sm sku-raised"
      style={{ borderColor: 'var(--border-outer)' }}
    >
      {/* WebSocket indicator */}
      <span
        title={`WebSocket: ${wsStatus}`}
        className={clsx(
          'flex items-center gap-1 text-xs font-mono shrink-0 mt-0.5',
        )}
        style={{
          color:
            wsStatus === 'connected'   ? 'var(--color-emerald)' :
            wsStatus === 'connecting'  ? 'var(--color-amber)' :
                                         'var(--color-red)',
        }}
      >
        {wsStatus === 'connected' ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
        {wsStatus}
      </span>

      <span
        className="text-[color:var(--border-outer)] shrink-0 mt-0.5 select-none"
        style={{ color: 'var(--text-muted)' }}
      >
        |
      </span>

      {/* Stage: category + detailed server message */}
      {meta ? (
        <span
          className="flex items-start gap-2 min-w-0 flex-1"
          title={message || meta.fallback}
        >
          <span className="mt-0.5 shrink-0">{meta.icon}</span>
          <span className="flex flex-col min-w-0 gap-0.5">
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              {meta.category}
            </span>
            <span
              className="text-[13px] leading-snug line-clamp-3"
              style={{ color: 'var(--text-secondary)' }}
            >
              {message || meta.fallback}
            </span>
          </span>
        </span>
      ) : (
        <span className="italic text-[13px]" style={{ color: 'var(--text-muted)' }}>
          Idle – press Space or hold the button
        </span>
      )}
    </div>
  )
}
