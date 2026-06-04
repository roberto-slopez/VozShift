const BASE = 'http://127.0.0.1:8000'

export async function fetchAudioPrompts(): Promise<string[]> {
  const res = await fetch(`${BASE}/audio-prompts`)
  if (!res.ok) throw new Error('Failed to load audio files')
  const data = await res.json()
  return data.files as string[]
}

export async function fetchCurrentModel(): Promise<string> {
  const res = await fetch(`${BASE}/health`)
  if (!res.ok) throw new Error('Failed to reach backend')
  const data = await res.json()
  return data.model_size as string
}

export async function changeModel(modelSize: string): Promise<void> {
  const res = await fetch(`${BASE}/settings/model`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model_size: modelSize }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? 'Failed to change model')
  }
}
