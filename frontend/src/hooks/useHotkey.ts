import { useCallback, useEffect, useRef } from 'react'

/**
 * Unified hold-vs-toggle detection for both keyboard (Space) and pointer events.
 *
 * Rules:
 *  - Press/hold for > HOLD_THRESHOLD ms → hold-to-talk: release immediately stops.
 *  - Short tap < HOLD_THRESHOLD ms       → toggle: a second tap stops.
 *
 * Returns pointer event handlers to attach to the mic button, and registers
 * the Space key listener on the document.
 */

const HOLD_THRESHOLD_MS = 300
const HOTKEY = ' ' // Space bar

export interface HotkeyHandlers {
  onPointerDown: (e: React.PointerEvent) => void
  onPointerUp:   (e: React.PointerEvent) => void
}

export interface UseHotkeyReturn {
  handlers: HotkeyHandlers
}

export function useHotkey(
  onStart: () => void,
  onStop:  () => void,
  enabled: boolean,
): UseHotkeyReturn {
  const isRecording  = useRef(false)
  const isHoldMode   = useRef(false)
  const holdTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pressedRef   = useRef(false) // prevent key repeat

  const start = useCallback(() => {
    if (isRecording.current) return
    isRecording.current = true
    onStart()
  }, [onStart])

  const stop = useCallback(() => {
    if (!isRecording.current) return
    isRecording.current = false
    isHoldMode.current  = false
    pressedRef.current  = false
    if (holdTimer.current) {
      clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
    onStop()
  }, [onStop])

  // ── Keyboard ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== HOTKEY) return
      if (e.repeat || pressedRef.current) return
      if ((e.target as HTMLElement).tagName === 'INPUT') return

      e.preventDefault()
      pressedRef.current = true

      if (isRecording.current) {
        // In toggle mode: second Space stops
        if (!isHoldMode.current) {
          stop()
        }
        return
      }

      start()

      // Start hold timer – if keyup arrives before it fires, it was a tap (toggle)
      holdTimer.current = setTimeout(() => {
        isHoldMode.current = true
      }, HOLD_THRESHOLD_MS)
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key !== HOTKEY) return
      pressedRef.current = false

      if (isHoldMode.current) {
        stop()
      }
      // If timer hasn't fired yet: we're in toggle mode → don't stop on key up
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup',   handleKeyUp)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup',   handleKeyUp)
    }
  }, [enabled, start, stop])

  // ── Pointer (button) ─────────────────────────────────────────────────────

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!enabled) return
    e.currentTarget.setPointerCapture(e.pointerId)

    if (isRecording.current) {
      if (!isHoldMode.current) {
        stop() // toggle off
      }
      return
    }

    start()
    holdTimer.current = setTimeout(() => {
      isHoldMode.current = true
    }, HOLD_THRESHOLD_MS)
  }, [enabled, start, stop])

  const onPointerUp = useCallback((_e: React.PointerEvent) => {
    if (!enabled) return
    if (isHoldMode.current) {
      stop()
    }
  }, [enabled, stop])

  return {
    handlers: { onPointerDown, onPointerUp },
  }
}
