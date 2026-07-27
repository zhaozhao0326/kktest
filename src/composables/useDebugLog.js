import { computed, ref } from 'vue'

const STORAGE_KEY = 'aichat_debug_logs_v1'
const MAX_ENTRIES = 220
const MAX_DETAIL_CHARS = 1400
const SECRET_KEY_REGEX = /(?:api[-_ ]?key|authorization|token|secret|password|cookie|session)/i

let installed = false
let nextId = 1

function getSessionStorage() {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage || null
  } catch {
    return null
  }
}

function safeParseEntries(raw) {
  try {
    const parsed = JSON.parse(String(raw || '[]'))
    if (!Array.isArray(parsed)) return []
    return parsed.filter(item => item && typeof item === 'object').slice(-MAX_ENTRIES)
  } catch {
    return []
  }
}

function loadInitialEntries() {
  const storage = getSessionStorage()
  if (!storage) return []
  return safeParseEntries(storage.getItem(STORAGE_KEY))
}

const entries = ref(loadInitialEntries())

function persistEntries() {
  const storage = getSessionStorage()
  if (!storage) return
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(entries.value.slice(-MAX_ENTRIES)))
  } catch {
    // Session logs are best-effort only.
  }
}

function truncateText(value, maxChars = MAX_DETAIL_CHARS) {
  const text = String(value ?? '')
  if (text.length <= maxChars) return text
  return text.slice(0, Math.max(1, maxChars - 1)) + '…'
}

function redactValue(value, key = '', depth = 0) {
  if (SECRET_KEY_REGEX.test(String(key || ''))) return '[redacted]'
  if (key === 'messages' && Array.isArray(value)) return `[${value.length} messages redacted]`
  if (key === 'content' && typeof value === 'string' && value.length > 80) return truncateText(value, 80)

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      code: value.code,
      status: value.status
    }
  }

  if (value === null || value === undefined) return value
  if (typeof value === 'string') return truncateText(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'function') return `[function ${value.name || 'anonymous'}]`
  if (depth >= 3) return '[object]'

  if (Array.isArray(value)) {
    return value.slice(0, 12).map((item, index) => redactValue(item, String(index), depth + 1))
  }

  if (typeof value === 'object') {
    const next = {}
    for (const [childKey, childValue] of Object.entries(value).slice(0, 36)) {
      next[childKey] = redactValue(childValue, childKey, depth + 1)
    }
    return next
  }

  return String(value)
}

function stringifyDetails(details) {
  if (details === null || details === undefined || details === '') return ''
  try {
    return truncateText(JSON.stringify(redactValue(details), null, 2))
  } catch {
    return truncateText(String(details))
  }
}

function normalizeLevel(level) {
  const value = String(level || '').trim().toLowerCase()
  if (value === 'error' || value === 'warn' || value === 'info' || value === 'debug') return value
  return 'info'
}

function formatConsoleArg(arg) {
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`
  if (typeof arg === 'string') return arg
  try {
    return JSON.stringify(redactValue(arg))
  } catch {
    return String(arg)
  }
}

export function addDebugLog(entry = {}) {
  const now = Date.now()
  const nextEntry = {
    id: `${now}_${nextId++}`,
    ts: now,
    level: normalizeLevel(entry.level),
    scope: String(entry.scope || 'app').trim() || 'app',
    message: truncateText(String(entry.message || '').trim() || '(no message)', 500),
    details: stringifyDetails(entry.details)
  }

  entries.value = [...entries.value, nextEntry].slice(-MAX_ENTRIES)
  persistEntries()
  return nextEntry
}

export function clearDebugLogs() {
  entries.value = []
  persistEntries()
}

export function formatDebugLogsForCopy(list = entries.value) {
  return list.map(item => {
    const time = new Date(item.ts || Date.now()).toLocaleString('zh-CN', { hour12: false })
    const head = `[${time}] [${String(item.level || 'info').toUpperCase()}] [${item.scope || 'app'}] ${item.message || ''}`
    return item.details ? `${head}\n${item.details}` : head
  }).join('\n\n')
}

export function installDebugLogCapture() {
  if (installed || typeof window === 'undefined') return
  installed = true

  const originalWarn = console.warn
  const originalError = console.error

  console.warn = (...args) => {
    addDebugLog({
      level: 'warn',
      scope: 'console',
      message: args.map(formatConsoleArg).join(' '),
      details: args.length > 1 ? args : null
    })
    originalWarn.apply(console, args)
  }

  console.error = (...args) => {
    addDebugLog({
      level: 'error',
      scope: 'console',
      message: args.map(formatConsoleArg).join(' '),
      details: args.length > 1 ? args : null
    })
    originalError.apply(console, args)
  }

  window.addEventListener('error', event => {
    addDebugLog({
      level: 'error',
      scope: 'window',
      message: event?.message || 'window error',
      details: {
        filename: event?.filename,
        lineno: event?.lineno,
        colno: event?.colno,
        error: event?.error
      }
    })
  })

  window.addEventListener('unhandledrejection', event => {
    addDebugLog({
      level: 'error',
      scope: 'promise',
      message: event?.reason?.message || String(event?.reason || 'unhandled rejection'),
      details: event?.reason
    })
  })
}

export function useDebugLog() {
  const counts = computed(() => entries.value.reduce((acc, item) => {
    const level = normalizeLevel(item?.level)
    acc[level] = (acc[level] || 0) + 1
    acc.all += 1
    return acc
  }, { all: 0, error: 0, warn: 0, info: 0, debug: 0 }))

  return {
    entries,
    counts,
    addDebugLog,
    clearDebugLogs,
    formatDebugLogsForCopy
  }
}
