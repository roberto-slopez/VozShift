import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClientMessage, ServerMessage } from '../lib/protocol'

export type WsStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface UseWebSocketReturn {
  status: WsStatus
  sendJson: (msg: ClientMessage) => void
  sendBinary: (data: ArrayBuffer | Blob) => void
  connect: () => void
  disconnect: () => void
}

const WS_URL = '/ws/session'
const MAX_RETRIES = 6
const BASE_DELAY_MS = 500

export function useWebSocket(
  onMessage: (msg: ServerMessage) => void,
  onBinary: (data: ArrayBuffer) => void,
): UseWebSocketReturn {
  const [status, setStatus] = useState<WsStatus>('disconnected')

  const wsRef       = useRef<WebSocket | null>(null)
  const retryRef    = useRef(0)
  const retryTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef  = useRef(true)

  const onMessageRef = useRef(onMessage)
  const onBinaryRef  = useRef(onBinary)
  useEffect(() => { onMessageRef.current = onMessage }, [onMessage])
  useEffect(() => { onBinaryRef.current  = onBinary  }, [onBinary])

  const clearRetry = () => {
    if (retryTimer.current) {
      clearTimeout(retryTimer.current)
      retryTimer.current = null
    }
  }

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return

    clearRetry()
    setStatus('connecting')

    const ws = new WebSocket(WS_URL)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return }
      retryRef.current = 0
      setStatus('connected')
    }

    ws.onmessage = (evt) => {
      if (evt.data instanceof ArrayBuffer) {
        onBinaryRef.current(evt.data)
      } else {
        try {
          const msg = JSON.parse(evt.data as string) as ServerMessage
          onMessageRef.current(msg)
        } catch {
          console.error('[WS] Failed to parse message:', evt.data)
        }
      }
    }

    ws.onerror = () => {
      setStatus('error')
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      wsRef.current = null

      if (retryRef.current < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * 2 ** retryRef.current
        retryRef.current++
        setStatus('connecting')
        retryTimer.current = setTimeout(connect, delay)
      } else {
        setStatus('disconnected')
      }
    }
  }, []) // stable – callbacks accessed via refs

  const disconnect = useCallback(() => {
    clearRetry()
    retryRef.current = MAX_RETRIES // prevent auto-reconnect
    wsRef.current?.close()
    wsRef.current = null
    setStatus('disconnected')
  }, [])

  const sendJson = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    } else {
      console.warn('[WS] sendJson called but socket is not open.')
    }
  }, [])

  const sendBinary = useCallback((data: ArrayBuffer | Blob) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data)
    } else {
      console.warn('[WS] sendBinary called but socket is not open.')
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      clearRetry()
      wsRef.current?.close()
    }
  }, [connect])

  return { status, sendJson, sendBinary, connect, disconnect }
}
