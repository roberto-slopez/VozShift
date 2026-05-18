/**
 * Shared type definitions for the VozShift WebSocket protocol.
 * Mirrors backend/app/protocol.py exactly.
 */

export type Stage =
  | 'recording'
  | 'received'
  | 'transcoding'
  | 'transcribing'
  | 'translating'
  | 'synthesizing'
  | 'done'

export interface StatusMsg {
  type: 'status'
  stage: Stage
  message: string
}

export interface TranscriptDelta {
  type: 'transcript_delta'
  text: string
}

export interface TranscriptFinal {
  type: 'transcript_final'
  text: string
}

export interface AudioMeta {
  type: 'audio_meta'
  sampleRate: number
  channels: number
  format: 'pcm_f32'
}

export interface AudioEnd {
  type: 'audio_end'
}

export interface ErrorMsg {
  type: 'error'
  code: string
  message: string
}

export type ServerMessage =
  | StatusMsg
  | TranscriptDelta
  | TranscriptFinal
  | AudioMeta
  | AudioEnd
  | ErrorMsg

// ── Client → Server ───────────────────────────────────────────────────────────

export interface StartMsg {
  type: 'start'
  mime: string
  sampleRate: number
  engine: 'whisper' | 'qwen3-asr'
  sourceLang: string
  targetLang: string
  audioPromptPath?: string | null
}

export interface StopMsg {
  type: 'stop'
}

export interface CancelMsg {
  type: 'cancel'
}

export type ClientMessage = StartMsg | StopMsg | CancelMsg
