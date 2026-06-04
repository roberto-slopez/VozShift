import { useState, useCallback } from 'react'
import clsx from 'clsx'
import { Play, Square, Loader2 } from 'lucide-react'

export type MessageRole = 'user' | 'bot'

export interface Message {
  id: string
  role: MessageRole
  text: string
  streaming: boolean
  audioData?: Float32Array
  audioSampleRate?: number
}

interface Props {
  message: Message
}

type PlayState = 'idle' | 'playing'

function useAudioReplay(data: Float32Array | undefined, sampleRate: number) {
  const [playState, setPlayState] = useState<PlayState>('idle')
  const sourceRef = { current: null as AudioBufferSourceNode | null }

  const play = useCallback(() => {
    if (!data || playState === 'playing') return
    const ctx = new AudioContext({ sampleRate })
    const buffer = ctx.createBuffer(1, data.length, sampleRate)
    buffer.getChannelData(0).set(data)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.onended = () => { setPlayState('idle'); ctx.close() }
    source.start()
    sourceRef.current = source
    setPlayState('playing')
  }, [data, sampleRate, playState]) // eslint-disable-line react-hooks/exhaustive-deps

  const stop = useCallback(() => {
    sourceRef.current?.stop()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { playState, play, stop }
}

export function MessageBubble({ message }: Props) {
  const isBot = message.role === 'bot'
  const { playState, play, stop } = useAudioReplay(
    message.audioData,
    message.audioSampleRate ?? 44100,
  )

  return (
    <div
      className={clsx(
        'flex w-full animate-fade-in-up',
        isBot ? 'justify-start' : 'justify-end',
      )}
    >
      <div
        className={clsx(
          'max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
          isBot
            ? [
                'sku-card rounded-tl-sm',
                'text-[color:var(--text-primary)]',
              ]
            : [
                'rounded-tr-sm text-white',
                'bg-[var(--accent)] border border-[var(--accent-border)]',
                'shadow-[2px_2px_8px_rgba(124,58,237,0.4),-1px_-1px_2px_rgba(255,255,255,0.08)]',
              ],
        )}
      >
        {/* Avatar label */}
        <div
          className={clsx(
            'text-[10px] font-semibold mb-1.5 uppercase tracking-widest',
            isBot ? 'text-[color:var(--text-muted)]' : 'text-white/60',
          )}
        >
          {isBot ? 'VozShift' : 'You'}
        </div>

        {/* Text */}
        <p className={clsx('text-[13px]', message.streaming && 'animate-blink-cursor')}>
          {message.text || <span className="opacity-30 italic">…</span>}
        </p>

        {/* Replay button */}
        {isBot && message.audioData && !message.streaming && (
          <button
            className={clsx(
              'mt-2.5 flex items-center gap-1.5 text-[11px] font-medium',
              'rounded-lg px-2 py-1 transition-all',
              playState === 'playing'
                ? 'sku-inset text-[color:var(--accent)] border-[var(--accent-border)]'
                : 'sku-raised text-[color:var(--text-muted)] hover:text-[color:var(--accent)]',
            )}
            onClick={playState === 'playing' ? stop : play}
            aria-label={playState === 'playing' ? 'Stop playback' : 'Replay audio'}
          >
            {playState === 'playing' ? (
              <>
                <span className="relative flex size-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent)] opacity-75" />
                  <span className="relative inline-flex rounded-full size-2 bg-[var(--accent)]" />
                </span>
                <Square className="size-3" />
                playing…
              </>
            ) : (
              <>
                <Play className="size-3" />
                replay
              </>
            )}
          </button>
        )}

        {/* Generating voice indicator */}
        {isBot && !message.audioData && !message.streaming && (
          <span className="mt-2 flex items-center gap-1 text-[11px] text-[color:var(--text-muted)]">
            <Loader2 className="size-3 animate-spin" />
            generating voice…
          </span>
        )}
      </div>
    </div>
  )
}
