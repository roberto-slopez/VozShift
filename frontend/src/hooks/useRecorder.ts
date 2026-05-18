import { useCallback, useRef, useState } from 'react'

export type RecorderState = 'idle' | 'requesting' | 'recording' | 'error'

export interface UseRecorderReturn {
  state: RecorderState
  /** Start recording and call onChunk for each ~250 ms audio blob. */
  start: (onChunk: (blob: Blob) => void) => Promise<void>
  /** Stop recording – resolves once the final chunk has been delivered. */
  stop: () => void
  /** Release mic stream and reset. */
  reset: () => void
  error: string | null
}

const PREFERRED_MIME = 'audio/webm;codecs=opus'
const FALLBACK_MIME  = 'audio/webm'

function getSupportedMime(): string {
  if (MediaRecorder.isTypeSupported(PREFERRED_MIME)) return PREFERRED_MIME
  if (MediaRecorder.isTypeSupported(FALLBACK_MIME))  return FALLBACK_MIME
  return ''
}

export function useRecorder(): UseRecorderReturn {
  const [state, setState]   = useState<RecorderState>('idle')
  const [error, setError]   = useState<string | null>(null)

  const recorderRef  = useRef<MediaRecorder | null>(null)
  const streamRef    = useRef<MediaStream | null>(null)
  const onChunkRef   = useRef<((blob: Blob) => void) | null>(null)

  const reset = useCallback(() => {
    recorderRef.current?.stop()
    streamRef.current?.getTracks().forEach(t => t.stop())
    recorderRef.current = null
    streamRef.current   = null
    onChunkRef.current  = null
    setState('idle')
    setError(null)
  }, [])

  const start = useCallback(async (onChunk: (blob: Blob) => void) => {
    reset()
    setError(null)
    setState('requesting')

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Microphone access denied.'
      setError(msg)
      setState('error')
      return
    }

    const mime = getSupportedMime()
    if (!mime) {
      stream.getTracks().forEach(t => t.stop())
      const msg = 'No supported audio MIME type found in this browser.'
      setError(msg)
      setState('error')
      return
    }

    const recorder = new MediaRecorder(stream, { mimeType: mime })
    recorderRef.current = recorder
    streamRef.current   = stream
    onChunkRef.current  = onChunk

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        onChunkRef.current?.(e.data)
      }
    }

    recorder.onerror = (e) => {
      const msg = (e as ErrorEvent).message ?? 'MediaRecorder error.'
      setError(msg)
      setState('error')
    }

    recorder.onstop = () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
    }

    recorder.start(250) // emit a chunk every 250 ms
    setState('recording')
  }, [reset])

  const stop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    setState('idle')
  }, [])

  return { state, start, stop, reset, error }
}
