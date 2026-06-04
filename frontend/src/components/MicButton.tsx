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
      {/* Outer pulse ring while recording */}
      {isRecording && (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full border-2 border-red-400/60 animate-ring-pulse pointer-events-none"
        />
      )}

      {/* Spinning arc while processing */}
      {isProcessing && (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full border-2 border-t-[var(--accent)] border-transparent animate-ring-spin pointer-events-none"
        />
      )}

      <button
        {...handlers}
        disabled={disabled}
        aria-label={
          isRecording  ? 'Stop recording (Space / click)' :
          isProcessing ? 'Processing…' :
                         'Start recording (Space / click)'
        }
        className={clsx(
          'relative z-10 w-20 h-20 rounded-full flex items-center justify-center',
          'transition-all duration-150 outline-none select-none',
          'focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] focus-visible:ring-offset-2',
          {
            // idle — raised embossed button
            'active:sku-press': !isActive && !disabled,
            // recording — inset pressed with red pulse
            'animate-mic-pulse': isRecording,
          },
          !isActive && !disabled && 'sku-raised',
          isRecording && 'sku-inset',
          isProcessing && [
            'bg-[var(--bg-sunken)] opacity-70 cursor-not-allowed',
            'shadow-[var(--shadow-inset)]',
          ],
          disabled && !isActive && 'opacity-40 cursor-not-allowed',
        )}
        style={
          isRecording
            ? { background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)' }
            : !isActive && !disabled
            ? { background: `linear-gradient(135deg, var(--accent-light) 0%, var(--accent) 100%)` }
            : undefined
        }
      >
        {isRecording  && <Square  className="size-7 text-white drop-shadow" />}
        {isProcessing && <Loader2 className="size-7 text-[var(--accent)] animate-spin" />}
        {!isActive    && <Mic     className="size-7 text-white drop-shadow" />}
      </button>

      {/* Hint label */}
      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[10px] text-[color:var(--text-muted)] whitespace-nowrap pointer-events-none">
        {isRecording  ? 'release or tap to stop' :
         isProcessing ? 'processing…' :
                        'Space / tap'}
      </span>
    </div>
  )
}
