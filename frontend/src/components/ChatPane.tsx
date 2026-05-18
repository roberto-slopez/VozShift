import { useEffect, useRef } from 'react'
import { MessageBubble, type Message } from './MessageBubble'

interface Props {
  messages: Message[]
}

export function ChatPane({ messages }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 scroll-smooth" style={{ scrollbarGutter: 'stable' }}>
      {messages.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-center select-none pointer-events-none">
          <p className="text-4xl mb-4">🎙️</p>
          <p className="text-white/30 text-sm">
            Hold <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-xs">Space</kbd>{' '}
            or tap the button to start speaking.
          </p>
          <p className="text-white/20 text-xs mt-1">
            Short tap = toggle &nbsp;·&nbsp; Hold = hold-to-talk
          </p>
        </div>
      )}
      {messages.map(msg => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
