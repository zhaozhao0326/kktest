import { createFetchControl, isAbortError } from './fetchControl'
import { prepareApiKey } from '../../utils/httpHeaders'

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_MODEL = 'gpt-image2'
const DEFAULT_SIZE = 'auto'
const DEFAULT_QUALITY = 'auto'
const DEFAULT_OUTPUT_FORMAT = 'png'
const MODE_AUTO = 'auto'
const MODE_IMAGES = 'images'
const MODE_CHAT = 'chat'

const OFFICIAL_SIZES = Object.freeze(['auto', '1024x1024', '1024x1536', '1536x1024'])
const SIZE_ALIASES = Object.freeze({
  square: '1024x1024',
  '1:1': '1024x1024',
  portrait: '1024x1536',
  vertical: '1024x1536',
  tall: '1024x1536',
  '2:3': '1024x1536',
  '3:4': '1024x1536',
  '9:16': '1024x1536',
  landscape: '1536x1024',
  horizontal: '1536x1024',
  wide: '1536x1024',
  '3:2': '1536x1024',
  '4:3': '1536x1024',
  '16:9': '1536x1024'
})

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeApiMode(value, config = {}) {
  const text = normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
  if (text === MODE_CHAT || text === 'openai_chat' || text === 'chat_completions' || text === 'openrouter') {
    return MODE_CHAT
  }
  if (
    text === MODE_IMAGES ||
    text === 'image' ||
    text === 'openai_images' ||
    text === 'image_generations' ||
    text === 'generations'
  ) {
    return MODE_IMAGES
  }

  const endpoint = normalizeText(config.endpoint || config.baseUrl || config.url).toLowerCase()
  if (/\/chat\/completions(?:\?|$)/i.test(endpoint)) return MODE_CHAT
  if (/openrouter\.ai/i.test(endpoint)) return MODE_CHAT
  return MODE_IMAGES
}

function sanitizeBase64(value) {
  return String(value || '').replace(/\s+/g, '')
}

function toDataUrl(base64, mimeType = 'image/png') {
  const clean = sanitizeBase64(base64)
  return clean ? `data:${mimeType};base64,${clean}` : ''
}

function normalizeApiKeyMode(value) {
  const text = normalizeText(value).toLowerCase()
  if (text === 'none' || text === 'noauth' || text === 'no_auth') return 'none'
  if (text === 'query' || text === 'url') return 'query'
  if (text === 'x-api-key' || text === 'x_api_key') return 'x-api-key'
  if (text === 'bearer' || text === 'authorization' || text === 'auth') return 'bearer'
  return 'bearer'
}

function appendApiKeyToUrl(url, apiKey, keyMode) {
  if (keyMode !== 'query' || !apiKey) return url
  try {
    const resolved = new URL(url, 'https://dummy.local')
    if (!resolved.searchParams.has('key')) resolved.searchParams.set('key', apiKey)
    if (resolved.origin === 'https://dummy.local') {
      return resolved.pathname + resolved.search + resolved.hash
    }
    return resolved.toString()
  } catch {
    const hasQuery = url.includes('?')
    const hasKey = /(?:^|[?&])key=/.test(url)
    if (hasKey) return url
    return url + (hasQuery ? '&' : '?') + 'key=' + encodeURIComponent(apiKey)
  }
}

function buildHeaders(config, apiKey, includeContentType = true) {
  const headers = includeContentType ? { 'Content-Type': 'application/json' } : {}
  const keyMode = normalizeApiKeyMode(config?.apiKeyMode)
  const token = keyMode === 'none' ? '' : prepareApiKey(apiKey, 'GPT Image API Key')
  if (keyMode === 'bearer' && token) headers.Authorization = 'Bearer ' + token
  if (keyMode === 'x-api-key' && token) headers['x-api-key'] = token
  return { headers, keyMode }
}

function resolveEndpoint(config = {}, path = 'images/generations') {
  const endpoint = normalizeText(config.endpoint || config.baseUrl || config.url) || DEFAULT_BASE_URL
  const trimmed = endpoint.replace(/\/+$/, '')
  const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  if (new RegExp(`/${escapedPath}(?:\\?|$)`, 'i').test(trimmed)) return trimmed
  if (/\/chat\/completions(?:\?|$)/i.test(trimmed)) {
    return trimmed.replace(/\/chat\/completions(?:\?.*)?$/i, '/' + path)
  }
  if (/\/images\/(?:generations|edits)(?:\?|$)/i.test(trimmed)) {
    return trimmed.replace(/\/images\/(?:generations|edits)(?:\?.*)?$/i, '/' + path)
  }
  return `${trimmed}/${path}`
}

function resolveChatEndpoint(config = {}) {
  const endpoint = normalizeText(config.endpoint || config.baseUrl || config.url) || DEFAULT_BASE_URL
  const trimmed = endpoint.replace(/\/+$/, '')
  if (/\/chat\/completions(?:\?|$)/i.test(trimmed)) return trimmed
  if (/\/images\/(?:generations|edits)(?:\?|$)/i.test(trimmed)) {
    return trimmed.replace(/\/images\/(?:generations|edits)(?:\?.*)?$/i, '/chat/completions')
  }
  return `${trimmed}/chat/completions`
}

function normalizeModel(value) {
  return normalizeText(value) || DEFAULT_MODEL
}

function normalizeDimension(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.max(64, Math.min(8192, Math.round(n)))
}

function normalizeAspectRatio(value) {
  const text = normalizeText(value).toLowerCase()
  if (!text) return ''
  const m = text.match(/^(\d+)\s*[:/x]\s*(\d+)$/i)
  if (!m) return ''
  const a = Number(m[1])
  const b = Number(m[2])
  if (!a || !b) return ''
  return `${a}:${b}`
}

function aspectRatioFromSizeValue(value) {
  const text = normalizeText(value).toLowerCase()
  if (!text || text === DEFAULT_SIZE) return ''
  const m = text.match(/^(\d{2,5})\s*[x×*]\s*(\d{2,5})$/i)
  if (!m) return normalizeAspectRatio(text)
  const width = Number(m[1])
  const height = Number(m[2])
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return ''
  const gcd = (a, b) => b ? gcd(b, a % b) : a
  const divisor = gcd(Math.round(width), Math.round(height)) || 1
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`
}

function normalizeChatImageSize(value) {
  const text = normalizeText(value).toUpperCase()
  if (!text) return ''
  if (text === '512PX' || text === '512') return '512px'
  if (text === '1K' || text === '1024' || text === '1024PX') return '1K'
  if (text === '2K' || text === '2048' || text === '2048PX') return '2K'
  if (text === '4K' || text === '4096' || text === '4096PX') return '4K'
  return ''
}

function officialSizeFromRatio(width, height) {
  const w = Number(width)
  const h = Number(height)
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return DEFAULT_SIZE
  const ratio = w / h
  if (ratio > 1.15) return '1536x1024'
  if (ratio < 0.87) return '1024x1536'
  return '1024x1024'
}

function normalizeSizeValue(value, allowCustomSize = false) {
  const text = normalizeText(value).toLowerCase()
  if (!text) return ''
  if (SIZE_ALIASES[text]) return SIZE_ALIASES[text]
  if (OFFICIAL_SIZES.includes(text)) return text

  const m = text.match(/^(\d{2,5})\s*[x×*]\s*(\d{2,5})$/i)
  if (m) {
    const width = normalizeDimension(m[1])
    const height = normalizeDimension(m[2])
    if (!width || !height) return ''
    const custom = `${width}x${height}`
    if (allowCustomSize || OFFICIAL_SIZES.includes(custom)) return custom
    return officialSizeFromRatio(width, height)
  }

  const ratio = normalizeAspectRatio(text)
  if (ratio && SIZE_ALIASES[ratio]) return SIZE_ALIASES[ratio]
  return ''
}

function resolveSize(config = {}, options = {}) {
  const allowCustomSize = options.allowCustomSize === true || config.allowCustomSize === true
  const explicit = normalizeSizeValue(
    options.openaiSize ?? options.imageSize ?? options.size ?? config.openaiSize ?? config.size,
    allowCustomSize
  )
  if (explicit) return explicit

  const aspectRatio = normalizeAspectRatio(options.aspectRatio ?? options.aspect_ratio ?? config.aspectRatio ?? config.aspect_ratio)
  if (aspectRatio) {
    const byAlias = normalizeSizeValue(aspectRatio, allowCustomSize)
    if (byAlias) return byAlias
  }

  const width = normalizeDimension(options.width ?? config.customWidth ?? config.width)
  const height = normalizeDimension(options.height ?? config.customHeight ?? config.height)
  if (width && height) {
    if (allowCustomSize) return `${width}x${height}`
    return officialSizeFromRatio(width, height)
  }

  return DEFAULT_SIZE
}

function normalizeEnum(value, allowed, fallback = '') {
  const text = normalizeText(value).toLowerCase()
  if (!text) return fallback
  return allowed.includes(text) ? text : fallback
}

function parseJsonObject(value) {
  if (!value) return null
  if (typeof value === 'object' && !Array.isArray(value)) return value
  const text = normalizeText(value)
  if (!text) return null
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
  } catch {
    return null
  }
  return null
}

function buildPromptText(prompt, options = {}) {
  const base = normalizeText(prompt)
  const negatives = normalizeText(options.negativePromptAppend || options.negativePrompt || options.negative_prompt)
  if (!negatives) return base
  return `${base}\n\nAvoid: ${negatives}`
}

function buildChatMessageContent(prompt, options = {}) {
  const promptText = buildPromptText(prompt, options)
  const baseImage = normalizeBaseImageValue(options.baseImage)
  if (!baseImage) return promptText

  return [
    { type: 'text', text: promptText },
    {
      type: 'image_url',
      image_url: {
        url: toDataUrl(baseImage, options.baseImageMimeType || options.baseImageMime || 'image/png')
      }
    }
  ]
}

function buildCommonPayload(prompt, modelId, config = {}, options = {}) {
  const extraBody = parseJsonObject(config.extraBody || config.extra_body) || {}
  const payload = {
    ...extraBody,
    model: modelId,
    prompt: buildPromptText(prompt, options),
    n: 1
  }

  const size = resolveSize(config, options)
  if (size) payload.size = size

  const quality = normalizeEnum(options.quality ?? config.quality, ['auto', 'low', 'medium', 'high', 'standard'], DEFAULT_QUALITY)
  if (quality) payload.quality = quality

  const outputFormat = normalizeEnum(
    options.outputFormat ?? options.output_format ?? config.outputFormat ?? config.output_format,
    ['png', 'jpeg', 'jpg', 'webp'],
    DEFAULT_OUTPUT_FORMAT
  )
  if (outputFormat) payload.output_format = outputFormat === 'jpg' ? 'jpeg' : outputFormat

  const background = normalizeEnum(options.background ?? config.background, ['auto', 'transparent', 'opaque'], '')
  if (background) payload.background = background

  const moderation = normalizeEnum(options.moderation ?? config.moderation, ['auto', 'low'], '')
  if (moderation) payload.moderation = moderation

  const responseFormat = normalizeEnum(options.responseFormat ?? options.response_format ?? config.responseFormat ?? config.response_format, ['url', 'b64_json'], '')
  if (responseFormat) payload.response_format = responseFormat

  return payload
}

function buildChatImageConfig(config = {}, options = {}) {
  const explicitImageConfig = parseJsonObject(config.imageConfig || config.image_config) || {}
  const imageConfig = { ...explicitImageConfig }
  const size = resolveSize(config, options)
  const aspectRatio = normalizeAspectRatio(
    options.aspectRatio ?? options.aspect_ratio ?? config.aspectRatio ?? config.aspect_ratio
  ) || aspectRatioFromSizeValue(size)
  const imageSize = normalizeChatImageSize(
    options.imageSize ?? options.image_size ?? config.imageSize ?? config.image_size
  )

  if (aspectRatio && imageConfig.aspect_ratio === undefined && imageConfig.aspectRatio === undefined) {
    imageConfig.aspect_ratio = aspectRatio
  }
  if (imageSize && imageConfig.image_size === undefined && imageConfig.imageSize === undefined) {
    imageConfig.image_size = imageSize
  }
  if (size && size !== DEFAULT_SIZE && imageConfig.size === undefined) {
    imageConfig.size = size
  }

  const quality = normalizeEnum(options.quality ?? config.quality, ['auto', 'low', 'medium', 'high', 'standard'], '')
  if (quality && imageConfig.quality === undefined) imageConfig.quality = quality

  const outputFormat = normalizeEnum(
    options.outputFormat ?? options.output_format ?? config.outputFormat ?? config.output_format,
    ['png', 'jpeg', 'jpg', 'webp'],
    ''
  )
  if (outputFormat && imageConfig.output_format === undefined) {
    imageConfig.output_format = outputFormat === 'jpg' ? 'jpeg' : outputFormat
  }

  const background = normalizeEnum(options.background ?? config.background, ['auto', 'transparent', 'opaque'], '')
  if (background && imageConfig.background === undefined) imageConfig.background = background

  return Object.keys(imageConfig).length > 0 ? imageConfig : null
}

function buildChatPayload(prompt, modelId, config = {}, options = {}) {
  const extraBody = parseJsonObject(config.extraBody || config.extra_body) || {}
  const payload = {
    ...extraBody,
    model: modelId,
    messages: Array.isArray(extraBody.messages)
      ? extraBody.messages
      : [
          {
            role: 'user',
            content: buildChatMessageContent(prompt, options)
          }
        ]
  }

  if (!Array.isArray(payload.modalities) && !Array.isArray(payload.response_modalities)) {
    payload.modalities = ['image', 'text']
  }
  if (payload.stream === undefined) payload.stream = false

  const imageConfig = buildChatImageConfig(config, options)
  if (imageConfig && payload.image_config === undefined && payload.imageConfig === undefined) {
    payload.image_config = imageConfig
  }

  const temperature = Number(options.temperature ?? config.temperature)
  if (Number.isFinite(temperature) && payload.temperature === undefined) {
    payload.temperature = Math.max(0, Math.min(2, temperature))
  }

  return payload
}

function normalizeBaseImageMimeType(value) {
  const text = normalizeText(value).toLowerCase()
  if (text === 'image/jpeg' || text === 'image/jpg') return 'image/jpeg'
  if (text === 'image/webp') return 'image/webp'
  if (text === 'image/gif') return 'image/gif'
  return 'image/png'
}

function normalizeBaseImageValue(value) {
  const text = normalizeText(value)
  if (!text) return ''
  if (!text.startsWith('data:')) return sanitizeBase64(text)
  const idx = text.indexOf(',')
  if (idx === -1) return ''
  return sanitizeBase64(text.slice(idx + 1))
}

function base64ToBlob(base64, mimeType = 'image/png') {
  const text = sanitizeBase64(base64)
  if (!text) throw new Error('参考图为空')
  if (typeof atob !== 'function') {
    throw new Error('当前环境不支持 atob，无法发送图片编辑请求')
  }

  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: normalizeBaseImageMimeType(mimeType) })
}

function extractDataUrlFromText(text) {
  const source = String(text || '')
  const dataUrlMatch = source.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=\s]+/i)
  if (dataUrlMatch?.[0]) {
    const hit = dataUrlMatch[0]
    const commaIdx = hit.indexOf(',')
    if (commaIdx > 0) {
      const prefix = hit.slice(0, commaIdx + 1)
      return prefix + sanitizeBase64(hit.slice(commaIdx + 1))
    }
    return hit
  }

  const markdownMatch = source.match(/!\[[^\]]*]\((data:image\/[^)]+|https?:\/\/[^)\s]+)\)/i)
  if (markdownMatch?.[1]) return markdownMatch[1]

  const plainUrlMatch = source.match(/https?:\/\/[^\s)]+/i)
  if (plainUrlMatch?.[0]) return plainUrlMatch[0]

  const trimmed = source.trim()
  if (/^[a-zA-Z0-9+/=\r\n\s]+$/.test(trimmed) && trimmed.length > 128) {
    return toDataUrl(trimmed, 'image/png')
  }
  return ''
}

function extractImageUrlFromUnknown(value) {
  if (typeof value === 'string') return extractDataUrlFromText(value)
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = extractImageUrlFromUnknown(item)
      if (hit) return hit
    }
    return ''
  }
  if (!value || typeof value !== 'object') return ''

  const directKeys = [
    'b64_json',
    'base64',
    'image_base64',
    'imageBase64',
    'url',
    'image_url',
    'imageUrl',
    'image',
    'data',
    'output'
  ]

  for (const key of directKeys) {
    if (!(key in value)) continue
    const raw = value[key]
    if ((key === 'b64_json' || key === 'base64' || key === 'image_base64' || key === 'imageBase64') && typeof raw === 'string') {
      return toDataUrl(raw, 'image/png')
    }
    const hit = extractImageUrlFromUnknown(raw)
    if (hit) return hit
  }

  if (value.inlineData || value.inline_data) {
    const inline = value.inlineData || value.inline_data
    const data = sanitizeBase64(inline?.data || inline?.bytes)
    if (data) {
      const mimeType = normalizeText(inline?.mimeType || inline?.mime_type) || 'image/png'
      return toDataUrl(data, mimeType)
    }
  }

  for (const nested of Object.values(value)) {
    const hit = extractImageUrlFromUnknown(nested)
    if (hit) return hit
  }

  return ''
}

async function readErrorText(res) {
  const text = await res.text().catch(() => '')
  if (!text) return ''
  try {
    const parsed = JSON.parse(text)
    return String(parsed?.error?.message || parsed?.message || parsed?.detail || parsed?.error || text)
  } catch {
    return text
  }
}

async function parseImageResponseOrThrow(res, label = 'GPT Image') {
  if (!res.ok) {
    const detail = await readErrorText(res)
    throw new Error(`${label} 生成失败: HTTP ${res.status}${detail ? ' ' + detail : ''}`)
  }

  const data = await res.json()
  const image = extractImageUrlFromUnknown(data)
  if (!image) throw new Error(`${label} 未返回图片`)
  return image
}

function appendPayloadToFormData(formData, payload) {
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    if (typeof value === 'object') {
      formData.append(key, JSON.stringify(value))
      return
    }
    formData.append(key, String(value))
  })
}

async function requestImageEdit(prompt, modelId, config, options, apiKey, keyMode, headers, signal) {
  const payload = buildCommonPayload(prompt, modelId, config, options)
  const baseImage = normalizeBaseImageValue(options.baseImage)
  if (!baseImage) return null

  const editHeaders = { ...headers }
  delete editHeaders['Content-Type']
  const formData = new FormData()
  appendPayloadToFormData(formData, payload)
  formData.append(
    'image',
    base64ToBlob(baseImage, options.baseImageMimeType || options.baseImageMime),
    'input.png'
  )

  const editUrl = appendApiKeyToUrl(resolveEndpoint(config, 'images/edits'), apiKey, keyMode)
  return await fetch(editUrl, {
    method: 'POST',
    headers: editHeaders,
    body: formData,
    signal
  })
}

async function requestImageGeneration(prompt, modelId, config, options, apiKey, keyMode, headers, signal) {
  const generationUrl = appendApiKeyToUrl(resolveEndpoint(config, 'images/generations'), apiKey, keyMode)
  const payload = buildCommonPayload(prompt, modelId, config, options)
  return await fetch(generationUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal
  })
}

async function requestChatGeneration(prompt, modelId, config, options, apiKey, keyMode, headers, signal) {
  const chatUrl = appendApiKeyToUrl(resolveChatEndpoint(config), apiKey, keyMode)
  const payload = buildChatPayload(prompt, modelId, config, options)
  return await fetch(chatUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal
  })
}

export async function generateOpenAIImage(prompt, config = {}, options = {}) {
  const keyMode = normalizeApiKeyMode(config?.apiKeyMode)
  const apiKey = keyMode === 'none' ? '' : prepareApiKey(config?.apiKey, 'GPT Image API Key')
  const hasCustomEndpoint = !!normalizeText(config?.endpoint || config?.baseUrl || config?.url)
  if (keyMode !== 'none' && !apiKey && !hasCustomEndpoint) {
    throw new Error('GPT Image API Key 未设置；使用第三方/反代时请先填写接口地址，API Key 可留空')
  }

  const modelId = normalizeModel(config?.model)
  const apiMode = normalizeApiMode(config?.apiMode || config?.mode || config?.transport, config)
  const { headers } = buildHeaders(config, apiKey, true)
  const fetchControl = createFetchControl(options.signal, options.timeoutMs)

  try {
    if (apiMode === MODE_CHAT) {
      const chatRes = await requestChatGeneration(prompt, modelId, config, options, apiKey, keyMode, headers, fetchControl.signal)
      return await parseImageResponseOrThrow(chatRes, 'GPT Image (Chat Completions)')
    }

    const hasBaseImage = !!normalizeBaseImageValue(options.baseImage)
    if (hasBaseImage && config.disableEdits !== true) {
      const editRes = await requestImageEdit(prompt, modelId, config, options, apiKey, keyMode, headers, fetchControl.signal)
      if (editRes?.ok) return await parseImageResponseOrThrow(editRes, 'GPT Image')

      const detail = editRes ? await readErrorText(editRes) : ''
      const retryable = editRes && [400, 404, 405, 415, 422, 501].includes(editRes.status)
      if (editRes && !retryable) {
        throw new Error(`GPT Image 编辑失败: HTTP ${editRes.status}${detail ? ' ' + detail : ''}`)
      }
    }

    const generationRes = await requestImageGeneration(prompt, modelId, config, options, apiKey, keyMode, headers, fetchControl.signal)
    return await parseImageResponseOrThrow(generationRes, 'GPT Image')
  } catch (e) {
    const msg = String(e?.message || e || '')
    if (fetchControl.isTimedOut()) {
      throw new Error(`GPT Image 请求超时（${fetchControl.timeoutMs}ms）`)
    }
    if (isAbortError(e)) {
      throw new Error('GPT Image 请求已取消')
    }
    throw new Error('GPT Image 请求失败: ' + msg)
  } finally {
    fetchControl.cleanup()
  }
}
