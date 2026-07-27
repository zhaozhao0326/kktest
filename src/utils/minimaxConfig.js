function trimTrailingSlashes(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function looksLikeUrlPath(value) {
  const raw = String(value || '').trim()
  if (!raw) return false
  if (/^https?:\/\//i.test(raw)) return true
  return /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?\/.+$/i.test(raw)
}

const INVISIBLE_CHARS_REGEX = /[\u200B-\u200D\u2060\uFEFF]/g
const VOICE_ID_KEYS = ['voice_id', 'voiceId', 'minimaxVoiceId']

function cleanMiniMaxIdText(value) {
  return String(value ?? '')
    .replace(INVISIBLE_CHARS_REGEX, '')
    .trim()
}

function stripOuterQuotes(value) {
  let next = cleanMiniMaxIdText(value)
  while (next.length >= 2) {
    const first = next[0]
    const last = next[next.length - 1]
    if (
      (first === '"' && last === '"') ||
      (first === "'" && last === "'") ||
      (first === '`' && last === '`')
    ) {
      next = cleanMiniMaxIdText(next.slice(1, -1))
      continue
    }
    break
  }
  return next
}

function extractVoiceIdFromObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  for (const key of VOICE_ID_KEYS) {
    const candidate = value[key]
    if (candidate !== undefined && candidate !== null) return candidate
  }
  const nested = value.voice_setting
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return extractVoiceIdFromObject(nested)
  }
  return ''
}

function extractVoiceIdFromUrl(value) {
  const raw = cleanMiniMaxIdText(value)
  if (!raw) return ''

  let urlText = raw
  if (!/^https?:\/\//i.test(urlText) && /^[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?(?:\/|$)/i.test(urlText)) {
    urlText = 'https://' + urlText
  }

  try {
    const url = new URL(urlText)
    for (const key of VOICE_ID_KEYS) {
      const candidate = url.searchParams.get(key)
      if (candidate) return candidate
    }
  } catch {
    // Ignore non-URL values.
  }

  return ''
}

function extractVoiceIdFromLabel(value) {
  const match = cleanMiniMaxIdText(value).match(/(?:^|[,{;\s])(?:voice_id|voiceId|minimaxVoiceId)\s*[:：=]\s*["'`]?([^"'`,}\]\s]+)/i)
  return match ? match[1] : ''
}

function sanitizeMiniMaxVoiceIdInternal(voiceId, depth) {
  if (depth > 4) return ''
  const raw = stripOuterQuotes(voiceId)
  if (!raw) return ''

  if (/^(?:\{|\[|")/.test(raw)) {
    try {
      const parsed = JSON.parse(raw)
      if (typeof parsed === 'string') {
        return sanitizeMiniMaxVoiceIdInternal(parsed, depth + 1)
      }
      const fromObject = extractVoiceIdFromObject(parsed)
      if (fromObject) return sanitizeMiniMaxVoiceIdInternal(fromObject, depth + 1)
    } catch {
      // Fall through to loose extraction.
    }
  }

  const fromUrl = extractVoiceIdFromUrl(raw)
  if (fromUrl) return sanitizeMiniMaxVoiceIdInternal(fromUrl, depth + 1)

  const fromLabel = extractVoiceIdFromLabel(raw)
  if (fromLabel) return sanitizeMiniMaxVoiceIdInternal(fromLabel, depth + 1)

  return raw
}

export function sanitizeMiniMaxGroupId(groupId, endpoint = '') {
  const trimmedGroupId = String(groupId ?? '').trim()
  if (!trimmedGroupId) return ''

  const normalizedGroupId = trimTrailingSlashes(trimmedGroupId)
  const normalizedEndpoint = trimTrailingSlashes(endpoint)

  if (normalizedEndpoint && normalizedGroupId === normalizedEndpoint) return ''
  if (looksLikeUrlPath(trimmedGroupId)) return ''

  return trimmedGroupId
}

export function sanitizeMiniMaxVoiceId(voiceId) {
  return sanitizeMiniMaxVoiceIdInternal(voiceId, 0)
}
