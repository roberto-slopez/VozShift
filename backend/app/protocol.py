"""
Shared message types for the VozShift WebSocket protocol.

Client → Server (JSON):
  {"type":"start","mime":"audio/webm;codecs=opus","sampleRate":48000}
  {"type":"stop"}
  {"type":"cancel"}
  <binary> – raw audio chunks from MediaRecorder

Server → Client (JSON):
  status | transcript_delta | transcript_final | audio_meta | audio_end | error

Server → Client (binary): PCM float32 LE chunks
"""

from typing import Literal
from pydantic import BaseModel


Stage = Literal[
    "recording",
    "received",
    "transcoding",
    "transcribing",
    "translating",
    "synthesizing",
    "done",
]


class StatusMsg(BaseModel):
    type: Literal["status"] = "status"
    stage: Stage
    message: str


class TranscriptDelta(BaseModel):
    type: Literal["transcript_delta"] = "transcript_delta"
    text: str


class TranscriptFinal(BaseModel):
    type: Literal["transcript_final"] = "transcript_final"
    text: str


class AudioMeta(BaseModel):
    type: Literal["audio_meta"] = "audio_meta"
    sampleRate: int
    channels: int
    format: Literal["pcm_f32"] = "pcm_f32"


class AudioEnd(BaseModel):
    type: Literal["audio_end"] = "audio_end"


class ErrorMsg(BaseModel):
    type: Literal["error"] = "error"
    code: str
    message: str
