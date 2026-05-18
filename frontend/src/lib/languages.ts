/**
 * Language definitions mirroring backend/app/languages.py.
 * Keys are ISO 639-1 (or 639-3) language codes accepted by the engines.
 */

export const WHISPER_LANGUAGES: Record<string, string> = {
  af:  'Afrikaans',
  sq:  'Albanian',
  am:  'Amharic',
  ar:  'Arabic',
  hy:  'Armenian',
  as:  'Assamese',
  az:  'Azerbaijani',
  ba:  'Bashkir',
  eu:  'Basque',
  be:  'Belarusian',
  bn:  'Bengali',
  bs:  'Bosnian',
  br:  'Breton',
  bg:  'Bulgarian',
  ca:  'Catalan',
  zh:  'Chinese',
  hr:  'Croatian',
  cs:  'Czech',
  da:  'Danish',
  nl:  'Dutch',
  en:  'English',
  et:  'Estonian',
  fo:  'Faroese',
  fi:  'Finnish',
  fr:  'French',
  gl:  'Galician',
  ka:  'Georgian',
  de:  'German',
  el:  'Greek',
  gu:  'Gujarati',
  ht:  'Haitian Creole',
  ha:  'Hausa',
  haw: 'Hawaiian',
  he:  'Hebrew',
  hi:  'Hindi',
  hu:  'Hungarian',
  is:  'Icelandic',
  id:  'Indonesian',
  it:  'Italian',
  ja:  'Japanese',
  jw:  'Javanese',
  kn:  'Kannada',
  kk:  'Kazakh',
  km:  'Khmer',
  ko:  'Korean',
  lo:  'Lao',
  la:  'Latin',
  lv:  'Latvian',
  ln:  'Lingala',
  lt:  'Lithuanian',
  lb:  'Luxembourgish',
  mk:  'Macedonian',
  mg:  'Malagasy',
  ms:  'Malay',
  ml:  'Malayalam',
  mt:  'Maltese',
  mi:  'Maori',
  mr:  'Marathi',
  mn:  'Mongolian',
  my:  'Myanmar',
  ne:  'Nepali',
  no:  'Norwegian',
  nn:  'Nynorsk',
  oc:  'Occitan',
  ps:  'Pashto',
  fa:  'Persian',
  pl:  'Polish',
  pt:  'Portuguese',
  pa:  'Punjabi',
  ro:  'Romanian',
  ru:  'Russian',
  sa:  'Sanskrit',
  sr:  'Serbian',
  sn:  'Shona',
  sd:  'Sindhi',
  si:  'Sinhala',
  sk:  'Slovak',
  sl:  'Slovenian',
  so:  'Somali',
  es:  'Spanish',
  su:  'Sundanese',
  sw:  'Swahili',
  sv:  'Swedish',
  tl:  'Tagalog',
  tg:  'Tajik',
  ta:  'Tamil',
  tt:  'Tatar',
  te:  'Telugu',
  th:  'Thai',
  bo:  'Tibetan',
  tr:  'Turkish',
  tk:  'Turkmen',
  uk:  'Ukrainian',
  ur:  'Urdu',
  uz:  'Uzbek',
  vi:  'Vietnamese',
  cy:  'Welsh',
  yi:  'Yiddish',
  yo:  'Yoruba',
}

/** Whisper's translate task always outputs English. */
export const WHISPER_TRANSLATE_TARGET = 'en'

/**
 * Target language options for a given engine + source language.
 *
 * Whisper:
 *   - Same as source → task=transcribe (output in source lang)
 *   - "en" (if source ≠ en) → task=translate (Whisper native)
 *
 * Qwen3-ASR:
 *   - Same as source → transcribe only (no translation)
 *   - "en" (if source ≠ en) → transcribe + NLLB-200-distilled translation
 */
export function targetOptions(engine: Engine, sourceLang: string): Record<string, string> {
  const srcLabel =
    (engine === 'whisper' ? WHISPER_LANGUAGES[sourceLang] : QWEN_LANGUAGES[sourceLang])
    ?? sourceLang

  const opts: Record<string, string> = {
    [sourceLang]: `${srcLabel} (no translation)`,
  }

  if (sourceLang !== 'en') {
    const suffix = engine === 'whisper' ? '(Whisper translate)' : '(NLLB)'
    opts['en'] = `English ${suffix}`
  }

  return opts
}

/** @deprecated use targetOptions() */
export function whisperTargetOptions(sourceLang: string): Record<string, string> {
  return targetOptions('whisper', sourceLang)
}

/** Qwen3-ASR – the 30 supported source languages. Output is always in the source language. */
export const QWEN_LANGUAGES: Record<string, string> = {
  zh:  'Chinese',
  en:  'English',
  yue: 'Cantonese',
  ar:  'Arabic',
  de:  'German',
  fr:  'French',
  es:  'Spanish',
  pt:  'Portuguese',
  id:  'Indonesian',
  it:  'Italian',
  ko:  'Korean',
  ru:  'Russian',
  th:  'Thai',
  vi:  'Vietnamese',
  ja:  'Japanese',
  tr:  'Turkish',
  hi:  'Hindi',
  ms:  'Malay',
  nl:  'Dutch',
  sv:  'Swedish',
  da:  'Danish',
  fi:  'Finnish',
  pl:  'Polish',
  cs:  'Czech',
  fil: 'Filipino',
  fa:  'Persian',
  el:  'Greek',
  hu:  'Hungarian',
  mk:  'Macedonian',
  ro:  'Romanian',
}

export type Engine = 'whisper' | 'qwen3-asr'

export const ENGINE_LABELS: Record<Engine, string> = {
  'whisper':    'Whisper (OpenAI)',
  'qwen3-asr':  'Qwen3-ASR-0.6B',
}

export function sourceLangsForEngine(engine: Engine): Record<string, string> {
  return engine === 'whisper' ? WHISPER_LANGUAGES : QWEN_LANGUAGES
}

/** Default source language when switching engine */
export function defaultSourceForEngine(_engine: Engine): string {
  return 'es'
}

/** Default target language for an engine + source combination */
export function defaultTargetForEngine(engine: Engine, sourceLang: string): string {
  if (engine === 'qwen3-asr') return sourceLang  // Qwen only transcribes
  return sourceLang === 'en' ? 'en' : 'en'       // Whisper: default to translate→en
}
