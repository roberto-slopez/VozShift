import { useEffect, useState } from 'react'
import { XCircle, X } from 'lucide-react'
import clsx from 'clsx'

interface Props {
  message: string | null
  onDismiss: () => void
}

export function ErrorToast({ message, onDismiss }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (message) {
      setVisible(true)
      const t = setTimeout(() => {
        setVisible(false)
        setTimeout(onDismiss, 300)
      }, 6000)
      return () => clearTimeout(t)
    }
  }, [message, onDismiss])

  if (!message) return null

  return (
    <div
      className={clsx(
        'fixed bottom-24 left-1/2 -translate-x-1/2 z-50',
        'flex items-start gap-2 max-w-sm w-full px-4 py-3 rounded-2xl',
        'sku-raised text-sm transition-all duration-300',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3',
      )}
      style={{
        background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
        borderColor: 'rgba(239,68,68,0.35)',
      }}
      role="alert"
    >
      <XCircle
        className="size-4 shrink-0 mt-0.5"
        style={{ color: 'var(--color-red)' }}
      />
      <span className="flex-1 text-[color:var(--text-primary)]">{message}</span>
      <button
        onClick={() => { setVisible(false); setTimeout(onDismiss, 300) }}
        className="shrink-0 transition-colors"
        style={{ color: 'var(--color-red)' }}
        aria-label="Dismiss error"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
