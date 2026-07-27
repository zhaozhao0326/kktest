const INVISIBLE_FORMAT_CHARS_RE = /[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g
const API_KEY_RE = /^[\x21-\x7E]+$/
const HEADER_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/
const INVALID_HEADER_VALUE_RE = /[\u0000-\u0008\u000A-\u001F\u007F]|[^\u0000-\u00FF]/

const API_KEY_WRAPPERS = Object.freeze([
  ['"', '"'],
  ["'", "'"],
  ['“', '”'],
  ['‘', '’'],
  ['＂', '＂'],
  ['＇', '＇']
])

export function stripInvisibleFormatChars(value) {
  return String(value ?? '').replace(INVISIBLE_FORMAT_CHARS_RE, '')
}

function stripApiKeyWrapper(value) {
  let result = value
  let changed = true

  while (changed && result.length >= 2) {
    changed = false
    for (const [open, close] of API_KEY_WRAPPERS) {
      if (result.startsWith(open) && result.endsWith(close)) {
        result = result.slice(open.length, -close.length).trim()
        changed = true
        break
      }
    }
  }

  return result
}

export function normalizeApiKey(value) {
  let result = stripInvisibleFormatChars(value).trim()
  result = stripApiKeyWrapper(result)

  const bearerMatch = result.match(/^Bearer[\t ]+(.+)$/i)
  if (bearerMatch) {
    result = stripApiKeyWrapper(bearerMatch[1].trim())
  }

  return stripInvisibleFormatChars(result).trim()
}

export function prepareApiKey(value, label = 'API Key') {
  const apiKey = normalizeApiKey(value)
  if (!apiKey) return ''
  if (!API_KEY_RE.test(apiKey)) {
    throw new Error(`${label} 含有中文、全角符号、空格或换行，请只填写密钥本体`)
  }
  return apiKey
}

export function assertValidHeader(name, value, label = '请求头') {
  const headerName = String(name ?? '').trim()
  const headerValue = String(value ?? '')

  if (!HEADER_NAME_RE.test(headerName)) {
    throw new Error(`${label}名称含有非法字符`)
  }
  if (INVALID_HEADER_VALUE_RE.test(headerValue)) {
    throw new Error(`${label} ${headerName} 的值含有中文、全角符号、换行或不可见字符`)
  }
}

export function assertValidHeaders(headers, label = '请求头') {
  if (!headers || typeof headers !== 'object') return headers
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined || value === null) continue
    assertValidHeader(name, value, label)
  }
  return headers
}

export function mergeRequestHeaders(...sources) {
  const headers = {}
  const keyByLowerName = new Map()

  for (const source of sources) {
    if (!source || typeof source !== 'object') continue
    for (const [rawName, rawValue] of Object.entries(source)) {
      if (rawValue === undefined || rawValue === null) continue
      const name = String(rawName).trim()
      const value = String(rawValue)
      assertValidHeader(name, value)

      const lowerName = name.toLowerCase()
      const previousName = keyByLowerName.get(lowerName)
      if (previousName && previousName !== name) delete headers[previousName]
      headers[name] = value
      keyByLowerName.set(lowerName, name)
    }
  }

  return headers
}

export function normalizeAbsoluteHttpUrl(value, label = 'API 地址') {
  const raw = stripInvisibleFormatChars(value).trim()
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('unsupported protocol')
    return url.href
  } catch {
    throw new Error(`${label}无效，请填写完整的 http:// 或 https:// 地址`)
  }
}
