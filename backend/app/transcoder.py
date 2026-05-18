"""
Audio transcoder – converts webm/opus bytes (from MediaRecorder) to a
float32 mono NumPy array at 16 kHz, which is what Whisper expects.

Requires FFmpeg to be available on PATH.
"""

import io
import subprocess
import numpy as np


TARGET_SAMPLE_RATE = 16_000


def transcode_webm_to_pcm16k_mono(audio_bytes: bytes) -> np.ndarray:
    """
    Run FFmpeg in a subprocess to decode webm/opus → PCM s16le at 16 kHz mono,
    then convert to float32 in [-1.0, 1.0] for Whisper.

    Raises RuntimeError if FFmpeg is not found or returns a non-zero exit code.
    """
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel", "error",
        "-i", "pipe:0",          # read from stdin
        "-f", "s16le",           # raw signed 16-bit little-endian output
        "-acodec", "pcm_s16le",
        "-ar", str(TARGET_SAMPLE_RATE),
        "-ac", "1",              # mono
        "pipe:1",                # write to stdout
    ]

    try:
        proc = subprocess.run(
            cmd,
            input=audio_bytes,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=60,
        )
    except FileNotFoundError:
        raise RuntimeError(
            "FFmpeg not found. Install it with: winget install Gyan.FFmpeg  "
            "and make sure it is in your PATH."
        )

    if proc.returncode != 0:
        stderr = proc.stderr.decode(errors="replace")
        raise RuntimeError(f"FFmpeg failed (rc={proc.returncode}): {stderr}")

    raw = np.frombuffer(proc.stdout, dtype="<i2")  # int16 LE
    return raw.astype(np.float32) / 32768.0         # normalise to [-1, 1]
