import clsx from 'clsx'
import type { ReactNode } from 'react'
import {
  Loader2,
  Mic,
  AudioLines,
  FileText,
  Languages,
  Volume2,
  CheckCircle2,
  Wifi,
  WifiOff,
} from 'lucide-react'
import type { Stage } from '../lib/protocol'
import type { WsStatus } from '../hooks/useWebSocket'

interface Props {
  stage: Stage | null
  message: string
  wsStatus: WsStatus
}

const STAGE_META: Record<
  Stage,
  { icon: ReactNode; category: string; fallback: string }
> = {
  recording: {
    icon: <Mic className="size-4 text-red-400" />,
    category: 'Live input',
    fallback: 'Listening to the microphone…',
  },
  received: {
    icon: <AudioLines className="size-4 text-sky-400" />,
    category: 'Raw audio',
    fallback: 'Recording bytes received from the browser.',
  },
  transcoding: {
    icon: <Loader2 className="size-4 text-sky-400 animate-spin" />,
    category: 'Decode',
    fallback: 'Normalizing audio for the recognizer.',
  },
  transcribing: {
    icon: <FileText className="size-4 text-violet-400" />,
    category: 'Speech → text',
    fallback: 'Recognizing words from your audio (STT).',
  },
  translating: {
    icon: <Languages className="size-4 text-violet-400" />,
    category: 'Text',
    fallback: 'Translating or revealing the reply text (not audio yet).',
  },
  synthesizing: {
    icon: <Volume2 className="size-4 text-amber-400" />,
    category: 'Text → speech',
    fallback: 'Generating the spoken reply audio (TTS).',
  },
  done: {
    icon: <CheckCircle2 className="size-4 text-emerald-400" />,
    category: 'Done',
    fallback: 'This turn finished.',
  },
}

export function StatusBar({ stage, message, wsStatus }: Props) {
  const meta = stage ? STAGE_META[stage] : null

  return (
    <div className="flex items-start gap-3 px-4 py-2.5 border-t border-white/5 bg-white/2 text-sm">
      {/* WebSocket indicator */}
      <span
        title={`WebSocket: ${wsStatus}`}
        className={clsx('flex items-center gap-1 text-xs font-mono shrink-0 mt-0.5', {
          'text-emerald-400': wsStatus === 'connected',
          'text-amber-400':   wsStatus === 'connecting',
          'text-red-400':     wsStatus === 'error' || wsStatus === 'disconnected',
        })}
      >
        {wsStatus === 'connected'
          ? <Wifi className="size-3.5" />
          : <WifiOff className="size-3.5" />}
        {wsStatus}
      </span>

      <span className="text-white/20 shrink-0 mt-0.5">|</span>

      {/* Stage: category + detailed server line (long text via title + line clamp) */}
      {meta ? (
        <span className="flex items-start gap-2 min-w-0 flex-1" title={message || meta.fallback}>
          <span className="mt-0.5 shrink-0">{meta.icon}</span>
          <span className="flex flex-col min-w-0 gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/45">
              {meta.category}
            </span>
            <span className="text-white/70 text-[13px] leading-snug line-clamp-3">
              {message || meta.fallback}
            </span>
          </span>
        </span>
      ) : (
        <span className="text-white/30 italic">Idle – press Space or hold the button</span>
      )}
    </div>
  )
}
