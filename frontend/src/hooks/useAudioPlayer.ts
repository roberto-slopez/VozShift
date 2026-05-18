import { useCallback, useRef } from 'react'
import type { AudioMeta } from '../lib/protocol'

/**
 * Streams PCM float32 LE audio chunks from the server and plays them
 * gap-free using the Web Audio API.
 *
 * Lifecycle:
 *  1. onAudioMeta(meta)  – initialise AudioContext with the server's sample rate.
 *  2. onAudioChunk(ab)   – queue an ArrayBuffer of float32 samples.
 *  3. onAudioEnd()       – flush any remaining state (currently a no-op).
 */

export interface UseAudioPlayerReturn {
  onAudioMeta:  (meta: AudioMeta) => void
  onAudioChunk: (data: ArrayBuffer) => void
  onAudioEnd:   () => void
  /** Returns a copy of the accumulated PCM data so the message bubble can offer a replay. */
  drainRecording: () => Float32Array | null
}

export function useAudioPlayer(): UseAudioPlayerReturn {
  const ctxRef         = useRef<AudioContext | null>(null)
  const nextStartTime  = useRef<number>(0)
  const sampleRateRef  = useRef<number>(44100)
  const channelsRef    = useRef<number>(1)

  // Accumulate all received samples for the replay feature
  const recordingBufs  = useRef<Float32Array[]>([])

  const onAudioMeta = useCallback((meta: AudioMeta) => {
    // Close any previous context first
    ctxRef.current?.close()

    const ctx = new AudioContext({ sampleRate: meta.sampleRate })
    ctxRef.current    = ctx
    sampleRateRef.current = meta.sampleRate
    channelsRef.current   = meta.channels
    nextStartTime.current = ctx.currentTime + 0.05 // small initial buffer
    recordingBufs.current = []
  }, [])

  const onAudioChunk = useCallback((data: ArrayBuffer) => {
    const ctx = ctxRef.current
    if (!ctx) return

    const float32 = new Float32Array(data)
    recordingBufs.current.push(float32)

    const channels = channelsRef.current
    const numFrames = float32.length / channels

    const buffer = ctx.createBuffer(channels, numFrames, ctx.sampleRate)
    for (let ch = 0; ch < channels; ch++) {
      const channelData = buffer.getChannelData(ch)
      for (let i = 0; i < numFrames; i++) {
        channelData[i] = float32[i * channels + ch]
      }
    }

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)

    // Schedule gapless playback
    const startAt = Math.max(nextStartTime.current, ctx.currentTime)
    source.start(startAt)
    nextStartTime.current = startAt + buffer.duration
  }, [])

  const onAudioEnd = useCallback(() => {
    // Nothing to flush; chunks are already scheduled
  }, [])

  const drainRecording = useCallback((): Float32Array | null => {
    const bufs = recordingBufs.current
    if (bufs.length === 0) return null

    const total = bufs.reduce((acc, b) => acc + b.length, 0)
    const merged = new Float32Array(total)
    let offset = 0
    for (const buf of bufs) {
      merged.set(buf, offset)
      offset += buf.length
    }
    recordingBufs.current = []
    return merged
  }, [])

  return { onAudioMeta, onAudioChunk, onAudioEnd, drainRecording }
}
