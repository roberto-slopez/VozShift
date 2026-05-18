import clsx from 'clsx'
import { Mic, Loader2, Square } from 'lucide-react'
import type { HotkeyHandlers } from '../hooks/useHotkey'

export type MicState = 'idle' | 'recording' | 'processing'

interface Props {
  micState: MicState
  handlers: HotkeyHandlers
  disabled?: boolean
}

export function MicButton({ micState, handlers, disabled = false }: Props) {
  const isRecording  = micState === 'recording'
  const isProcessing = micState === 'processing'
  const isActive     = isRecording || isProcessing

  return (
    <div className="relative flex items-center justify-center p-4">
      {/* Outer pulse ring – visible while recording */}
      {isRecording && (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full border-2 border-red-400/50 animate-ring-pulse pointer-events-none"
        />
      )}

      {/* Spinning arc – visible while processing */}
      {isProcessing && (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full border-2 border-t-violet-400 border-transparent animate-ring-spin pointer-events-none"
        />
      )}

      <button
        {...handlers}
        disabled={disabled}
        aria-label={
          isRecording  ? 'Stop recording (Space / click)'  :
          isProcessing ? 'Processing…' :
                         'Start recording (Space / click)'
        }
        className={clsx(
          'relative z-10 w-20 h-20 rounded-full flex items-center justify-center',
          'transition-all duration-150 outline-none select-none',
          'focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f0f13]',
          {
            // idle
            'bg-violet-600 hover:bg-violet-500 active:scale-95 shadow-lg shadow-violet-900/50':
              !isActive && !disabled,
            // recording
            'bg-red-500 hover:bg-red-400 active:scale-95 shadow-lg shadow-red-900/60':
              isRecording,
            // processing
            'bg-violet-800/60 cursor-not-allowed': isProcessing,
            // disabled
            'bg-white/5 cursor-not-allowed': disabled && !isActive,
          },
        )}
      >
        {isRecording  && <Square className="size-7 text-white" />}
        {isProcessing && <Loader2 className="size-7 text-violet-300 animate-spin" />}
        {!isActive    && <Mic    className="size-7 text-white" />}
      </button>

      {/* Hint label */}
      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[10px] text-white/25 whitespace-nowrap pointer-events-none">
        {isRecording  ? 'release or tap to stop' :
         isProcessing ? 'processing…' :
                        'Space / tap'}
      </span>
    </div>
  )
}
