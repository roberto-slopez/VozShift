import whisper
import sounddevice as sd
import numpy as np

# ── Config ──────────────────────────────────────────
SAMPLE_RATE = 16000        # Whisper espera 16kHz
DURATION_SECONDS = 30       # segundos que graba por chunk
MODEL_SIZE = "small"        # tiny | base | small | medium | large
LANGUAGE = "es"            # None = autodetect
# ────────────────────────────────────────────────────

def record_audio(duration: int, sample_rate: int) -> np.ndarray:
    print(f"🎙️  Grabando {duration}s... habla ahora")
    audio = sd.rec(
        frames=int(duration * sample_rate),
        device=1,
        samplerate=sample_rate,
        channels=1,
        dtype="float32"
    )
    sd.wait()
    print(f"Fin de la grabación")
    return audio.flatten()

def transcribe(model: whisper.Whisper, audio: np.ndarray) -> str:
    result = model.transcribe(
        audio,
        language=LANGUAGE,
        fp16=False,   # False es más estable en CPU/GPU mixto,
        task="translate"
    )
    return result["text"].strip()

def main():
    print(f"⏳ Cargando modelo Whisper '{MODEL_SIZE}'...")
    model = whisper.load_model(MODEL_SIZE)
    print("✅ Modelo listo\n")

    while True:
        input("Presiona Enter para grabar (Ctrl+C para salir)...")
        audio = record_audio(DURATION_SECONDS, SAMPLE_RATE)
        text = transcribe(model, audio)
        print(f"📝 Transcripción: {text}\n")

if __name__ == "__main__":
    main()