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
    <div
      className="flex-1 overflow-y-auto px-4 py-6 space-y-4 scroll-smooth sku-inset rounded-none"
      style={{ scrollbarGutter: 'stable' }}
    >
      {messages.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-center select-none pointer-events-none gap-3">
          <div className="sku-raised rounded-full w-16 h-16 flex items-center justify-center text-3xl">
            🎙️
          </div>
          <p className="text-[color:var(--text-muted)] text-sm">
            Hold{' '}
            <kbd className="px-1.5 py-0.5 rounded sku-raised font-mono text-xs text-[color:var(--text-secondary)]">
              Space
            </kbd>{' '}
            or tap the button to start speaking.
          </p>
          <p className="text-[color:var(--text-muted)] text-xs opacity-70">
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
