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
    source.onended = () => {
      setPlayState('idle')
      ctx.close()
    }
    source.start()
    sourceRef.current = source
    setPlayState('playing')
  }, [data, sampleRate, playState]) // eslint-disable-line react-hooks/exhaustive-deps

  const stop = useCallback(() => {
    sourceRef.current?.stop() // triggers onended → resets state
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
          'max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-lg',
          isBot
            ? 'bg-white/6 border border-white/8 text-white/85 rounded-tl-sm backdrop-blur-sm'
            : 'bg-violet-600/90 border border-violet-500/40 text-white rounded-tr-sm shadow-violet-900/30',
        )}
      >
        {/* Avatar label */}
        <div className="text-[10px] font-semibold mb-1.5 uppercase tracking-widest opacity-40">
          {isBot ? 'VozShift' : 'You'}
        </div>

        {/* Text */}
        <p className={clsx('text-[13px]', message.streaming && 'animate-blink-cursor')}>
          {message.text || <span className="opacity-30 italic">…</span>}
        </p>

        {/* Replay button – only for bot with audio, once streaming is done */}
        {isBot && message.audioData && !message.streaming && (
          <button
            className={clsx(
              'mt-2.5 flex items-center gap-1.5 text-[11px] font-medium transition-all px-2 py-1 rounded-lg',
              playState === 'playing'
                ? 'bg-violet-500/20 text-violet-300 border border-violet-400/30'
                : 'text-white/35 hover:text-violet-300 hover:bg-white/5 border border-transparent',
            )}
            onClick={playState === 'playing' ? stop : play}
            aria-label={playState === 'playing' ? 'Stop playback' : 'Replay audio'}
          >
            {playState === 'playing' ? (
              <>
                <span className="relative flex size-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                  <span className="relative inline-flex rounded-full size-2 bg-violet-500" />
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

        {/* Loading indicator while synthesising (audio not yet available) */}
        {isBot && !message.audioData && !message.streaming && (
          <span className="mt-2 flex items-center gap-1 text-[11px] text-white/25">
            <Loader2 className="size-3 animate-spin" />
            generating voice…
          </span>
        )}
      </div>
    </div>
  )
}
