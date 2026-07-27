import { assertValidHeader, mergeRequestHeaders } from '../../utils/httpHeaders'
import { getModelParameterCompatibility } from './modelParameterCompatibility'

const UNSAFE_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor'])

function getCustomJsonLabel(label) {
  const normalized = String(label || '').trim().toLowerCase()
  if (normalized === 'headers' || normalized === 'header') return 'headers'
  if (normalized === 'body') return 'body'
  return normalized || 'JSON'
}

export function parseCustomJsonObject(value, label = 'JSON') {
  const raw = String(value ?? '').trim()
  if (!raw) return {}

  const displayLabel = getCustomJsonLabel(label)
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`自定义 ${displayLabel} 不是有效 JSON`)
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`自定义 ${displayLabel} 必须是 JSON 对象`)
  }
  return parsed
}

export function parseCustomRequestHeaders(value) {
  const rawHeaders = parseCustomJsonObject(value, 'headers')
  const headers = {}
  for (const [key, rawValue] of Object.entries(rawHeaders)) {
    const headerName = String(key || '').trim()
    if (!headerName || rawValue === null || rawValue === undefined) continue
    const headerValue = String(rawValue)
    assertValidHeader(headerName, headerValue, '自定义请求头')
    headers[headerName] = headerValue
  }
  return headers
}

export function parseCustomRequestBody(value) {
  return parseCustomJsonObject(value, 'body')
}

function splitRemovedParameterInput(value) {
  const rawItems = Array.isArray(value)
    ? value
    : String(value ?? '').split(/[\n,，]+/)
  return rawItems.map(item => String(item || '').trim()).filter(Boolean)
}

function validateParameterPath(path) {
  const segments = String(path || '').split('.').map(segment => segment.trim())
  if (segments.some(segment => !segment)) {
    throw new Error(`去除参数路径“${path}”无效，请使用如 generationConfig.temperature 的点号路径`)
  }
  if (segments.some(segment => UNSAFE_PATH_SEGMENTS.has(segment))) {
    throw new Error(`去除参数路径“${path}”不可用`)
  }
  return segments.join('.')
}

export function parseRemovedRequestParameters(value) {
  const result = []
  const seen = new Set()
  for (const item of splitRemovedParameterInput(value)) {
    const path = validateParameterPath(item)
    if (seen.has(path)) continue
    seen.add(path)
    result.push(path)
  }
  return result
}

export function normalizeRemovedRequestParameters(value) {
  const result = []
  const seen = new Set()
  for (const item of splitRemovedParameterInput(value)) {
    try {
      const path = validateParameterPath(item)
      if (seen.has(path)) continue
      seen.add(path)
      result.push(path)
    } catch {
      // Ignore malformed legacy values while loading persisted configurations.
    }
  }
  return result
}

function cloneJsonValue(value) {
  if (Array.isArray(value)) return value.map(cloneJsonValue)
  if (!value || typeof value !== 'object') return value
  const cloned = {}
  for (const [key, child] of Object.entries(value)) {
    if (UNSAFE_PATH_SEGMENTS.has(key)) continue
    cloned[key] = cloneJsonValue(child)
  }
  return cloned
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function mergeRequestBody(baseBody, addedBody) {
  const base = isPlainObject(baseBody) ? baseBody : {}
  const added = isPlainObject(addedBody) ? addedBody : {}
  const merged = cloneJsonValue(base)

  for (const [key, value] of Object.entries(added)) {
    if (UNSAFE_PATH_SEGMENTS.has(key)) continue
    if (isPlainObject(value) && isPlainObject(merged[key])) {
      merged[key] = mergeRequestBody(merged[key], value)
    } else {
      merged[key] = cloneJsonValue(value)
    }
  }
  return merged
}

export function removeRequestBodyParameters(body, parameterPaths) {
  const result = cloneJsonValue(isPlainObject(body) ? body : {})
  for (const path of parseRemovedRequestParameters(parameterPaths)) {
    const segments = path.split('.')
    let target = result
    for (let index = 0; index < segments.length - 1; index += 1) {
      const segment = segments[index]
      if (!target || typeof target !== 'object' || !Object.prototype.hasOwnProperty.call(target, segment)) {
        target = null
        break
      }
      target = target[segment]
    }
    if (target && typeof target === 'object') {
      delete target[segments[segments.length - 1]]
    }
  }
  return result
}

export function applyRequestParameterFilters(body, config = {}) {
  let filteredBody = cloneJsonValue(isPlainObject(body) ? body : {})
  if (config.autoAdaptParameters !== false) {
    const compatibility = getModelParameterCompatibility(config)
    filteredBody = removeRequestBodyParameters(filteredBody, compatibility.removedParameters)
  }
  return removeRequestBodyParameters(filteredBody, config.removeBodyParams)
}

export function applyRequestCustomization(request, config = {}) {
  const baseRequest = request && typeof request === 'object' ? request : {}
  const customHeaders = parseCustomRequestHeaders(config.customHeadersJson)
  const customBody = parseCustomRequestBody(config.customBodyJson)
  const body = applyRequestParameterFilters(
    mergeRequestBody(baseRequest.body, customBody),
    config
  )

  return {
    ...baseRequest,
    headers: mergeRequestHeaders(baseRequest.headers, customHeaders),
    body
  }
}
