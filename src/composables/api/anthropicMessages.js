import { parseOptionalMaxTokens, parseOptionalTemperature } from './chatCompletions'
import { prepareApiKey } from '../../utils/httpHeaders'
import { normalizeCacheConfig } from './providerFormats'

const DEFAULT_ANTHROPIC_VERSION = '2023-06-01'
const DEFAULT_ERROR_TEXT_LIMIT = 200

// Anthropic 要求首条消息必须为 user 角色；角色扮演场景常以助手开场白开头，此时补一条占位 user 消息。
export const ANTHROPIC_LEADING_USER_PLACEHOLDER = '[对话开始]'

export function resolveAnthropicMessagesUrl(baseUrl) {
  const raw = String(baseUrl || '').trim().replace(/\/+$/, '')
  if (!raw) return '/v1/messages'
  if (/\/v1\/messages$/i.test(raw) || /\/messages$/i.test(raw)) return raw
  if (/\/v1$/i.test(raw)) return raw + '/messages'
  return raw + '/v1/messages'
}

export function isOfficialAnthropicUrl(url) {
  try {
    const host = new URL(String(url || ''), 'https://placeholder.invalid').hostname.toLowerCase()
    return host === 'api.anthropic.com' || host.endsWith('.anthropic.com')
  } catch {
    return false
  }
}

export function buildAnthropicHeaders(cfg = {}) {
  const apiKey = prepareApiKey(cfg.key, 'Anthropic API Key')
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey
  }
  if (isOfficialAnthropicUrl(cfg.url)) {
    headers['anthropic-version'] = String(cfg.anthropicVersion || DEFAULT_ANTHROPIC_VERSION).trim() || DEFAULT_ANTHROPIC_VERSION
    // 官方 API 需要此头才允许浏览器直连
    headers['anthropic-dangerous-direct-browser-access'] = 'true'
  } else {
    // 中转站（OpenRouter/one-api 等）普遍用 Bearer 认证，且 CORS 预检
    // 通常不放行 anthropic-version 等自定义头，带上会导致请求被浏览器拦截
    headers['Authorization'] = `Bearer ${apiKey}`
  }
  return headers
}

function extractTextFromContent(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return String(content || '')
  return content.map(part => {
    if (typeof part === 'string') return part
    if (typeof part?.text === 'string') return part.text
    return ''
  }).join('')
}

function normalizeAnthropicContent(content) {
  if (Array.isArray(content)) {
    const parts = []
    for (const part of content) {
      if (typeof part === 'string') {
        if (part.trim()) parts.push({ type: 'text', text: part })
        continue
      }
      if (!part || typeof part !== 'object') continue
      if (part.type === 'text' && typeof part.text === 'string') {
        if (part.text.trim()) parts.push({ type: 'text', text: part.text })
        continue
      }
      if (part.type === 'image_url' && part.image_url?.url) {
        parts.push({
          type: 'image',
          source: normalizeAnthropicImageSource(part.image_url.url)
        })
        continue
      }
      if (part.type === 'image' && part.source) {
        parts.push(part)
      }
    }
    return parts
  }
  const text = extractTextFromContent(content)
  return text.trim() ? [{ type: 'text', text }] : []
}

export function normalizeAnthropicToolResultMessage(message) {
  const block = {
    type: 'tool_result',
    tool_use_id: String(message?.tool_call_id || message?.toolUseId || '').trim()
  }
  const text = extractTextFromContent(message?.content)
  if (text) block.content = text
  return {
    role: 'user',
    content: [block]
  }
}

function normalizeAnthropicImageSource(url) {
  const value = String(url || '').trim()
  const dataMatch = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
  if (dataMatch) {
    return {
      type: 'base64',
      media_type: dataMatch[1],
      data: dataMatch[2]
    }
  }
  return {
    type: 'url',
    url: value
  }
}

function safeParseToolArguments(value) {
  try {
    const parsed = JSON.parse(String(value || '{}'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { value: parsed }
  } catch {
    return {}
  }
}

function normalizeAnthropicAssistantToolCalls(message) {
  if (!Array.isArray(message?.tool_calls) || message.tool_calls.length === 0) return null
  const parts = []
  const visibleText = extractTextFromContent(message.content).trim()
  if (visibleText) parts.push({ type: 'text', text: visibleText })
  for (const call of message.tool_calls) {
    const name = String(call?.function?.name || '').trim()
    if (!name) continue
    parts.push({
      type: 'tool_use',
      id: String(call.id || ''),
      name,
      input: safeParseToolArguments(call.function?.arguments)
    })
  }
  return parts.length > 0 ? parts : null
}

function shouldCacheSystemPart(part, cacheConfig) {
  if (!cacheConfig.enabled || !cacheConfig.systemPrompt) return false
  if (part?.type !== 'text') return false
  return String(part.text || '').trim().length > 0
}

function buildCacheControl(cacheConfig) {
  if (cacheConfig.ttl === '1h') {
    return { type: 'ephemeral', ttl: '1h' }
  }
  // Anthropic defaults an ephemeral cache breakpoint to five minutes.
  return { type: 'ephemeral' }
}

function isToolResultPart(part) {
  return part?.type === 'tool_result'
}

function mergeConsecutiveAnthropicMessages(conversation) {
  const merged = []
  for (const message of conversation) {
    const prev = merged[merged.length - 1]
    if (prev && prev.role === message.role) {
      prev.content = prev.content.concat(message.content)
      continue
    }
    merged.push({ role: message.role, content: [...message.content] })
  }
  // tool_result 必须紧跟对应 tool_use，合并后放到消息内容最前面。
  for (const message of merged) {
    if (message.role === 'user' && message.content.some(isToolResultPart)) {
      message.content = [
        ...message.content.filter(isToolResultPart),
        ...message.content.filter(part => !isToolResultPart(part))
      ]
    }
  }
  return merged
}

function trimTrailingAssistantWhitespace(conversation) {
  const last = conversation[conversation.length - 1]
  if (!last || last.role !== 'assistant') return conversation
  const content = [...last.content]
  while (content.length > 0) {
    const part = content[content.length - 1]
    if (part?.type !== 'text') break
    const trimmed = String(part.text || '').replace(/\s+$/, '')
    if (trimmed) {
      content[content.length - 1] = { ...part, text: trimmed }
      break
    }
    content.pop()
  }
  if (content.length === 0) return conversation.slice(0, -1)
  return [...conversation.slice(0, -1), { ...last, content }]
}

function splitMessagesForAnthropic(messages, cacheConfig) {
  const system = []
  const rawConversation = []

  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message || typeof message !== 'object') continue
    const role = String(message.role || '').trim()
    const parts = normalizeAnthropicContent(message.content)

    if (role === 'system') {
      for (const part of parts) {
        if (part.type !== 'text') continue
        if (shouldCacheSystemPart(part, cacheConfig)) {
          system.push({ ...part, cache_control: buildCacheControl(cacheConfig) })
        } else {
          system.push(part)
        }
      }
      continue
    }

    if (role === 'assistant') {
      const content = normalizeAnthropicAssistantToolCalls(message) || parts
      if (content.length > 0) {
        rawConversation.push({ role: 'assistant', content })
      }
      continue
    }

    if (role === 'user') {
      if (parts.length > 0) {
        rawConversation.push({ role: 'user', content: parts })
      }
      continue
    }

    if (role === 'tool') {
      rawConversation.push(normalizeAnthropicToolResultMessage(message))
    }
  }

  let conversation = mergeConsecutiveAnthropicMessages(rawConversation)
  conversation = trimTrailingAssistantWhitespace(conversation)
  if (conversation.length === 0 || conversation[0].role !== 'user') {
    conversation.unshift({
      role: 'user',
      content: [{ type: 'text', text: ANTHROPIC_LEADING_USER_PLACEHOLDER }]
    })
  }

  return { system, messages: conversation }
}

function normalizeAnthropicTools(tools) {
  if (!Array.isArray(tools)) return []
  return tools.map(tool => {
    const fn = tool?.function || tool
    const name = String(fn?.name || '').trim()
    if (!name) return null
    return {
      name,
      description: String(fn.description || '').trim(),
      input_schema: fn.parameters && typeof fn.parameters === 'object'
        ? fn.parameters
        : { type: 'object', properties: {} }
    }
  }).filter(Boolean)
}

export function buildAnthropicMessagesRequest(cfg = {}, messages = [], options = {}) {
  const cacheConfig = normalizeCacheConfig(cfg.cacheConfig)
  const split = splitMessagesForAnthropic(messages, cacheConfig)
  const body = {
    model: cfg.model,
    stream: options.stream !== false,
    max_tokens: parseOptionalMaxTokens(cfg.maxTokens) || 4096,
    messages: split.messages
  }

  if (split.system.length > 0) body.system = split.system

  const temperature = parseOptionalTemperature(cfg.temperature)
  if (temperature !== null) body.temperature = temperature
  const tools = normalizeAnthropicTools(options.tools)
  if (tools.length > 0) {
    body.tools = tools
    if (options.tool_choice === 'none') {
      body.tool_choice = { type: 'none' }
    } else if (typeof options.tool_choice === 'string' && options.tool_choice && options.tool_choice !== 'auto') {
      body.tool_choice = { type: 'tool', name: options.tool_choice }
    }
  }

  if (options.maxTokens || options.max_tokens) {
    const maxTokens = parseOptionalMaxTokens(options.maxTokens || options.max_tokens)
    if (maxTokens !== null) body.max_tokens = maxTokens
  }

  return {
    url: resolveAnthropicMessagesUrl(cfg.url),
    headers: buildAnthropicHeaders(cfg),
    body
  }
}

function extractTextFromAnthropicPayload(payload) {
  if (!payload || typeof payload !== 'object') return ''
  if (payload.type === 'content_block_delta' && payload.delta?.type === 'text_delta') {
    return String(payload.delta.text || '')
  }
  if (payload.type === 'content_block_start' && payload.content_block?.type === 'text') {
    return String(payload.content_block.text || '')
  }
  if (Array.isArray(payload.content)) return extractAnthropicNonStreamText(payload)
  return ''
}

function extractReasoningFromAnthropicPayload(payload) {
  if (!payload || typeof payload !== 'object') return ''
  if (payload.type === 'content_block_delta' && payload.delta?.type === 'thinking_delta') {
    return String(payload.delta.thinking || payload.delta.text || '')
  }
  if (payload.type === 'content_block_start' && payload.content_block?.type === 'thinking') {
    return String(payload.content_block.thinking || payload.content_block.text || '')
  }
  return ''
}

function extractFinishReason(payload) {
  if (!payload || typeof payload !== 'object') return ''
  return payload.delta?.stop_reason || payload.stop_reason || ''
}

export async function consumeAnthropicMessagesStream(res, onDelta, options = {}) {
  const reader = res?.body?.getReader?.()
  if (!reader) throw new Error('当前环境不支持流式读取')

  const decoder = new TextDecoder()
  let lineBuffer = ''
  let eventLines = []
  let emittedChars = 0
  let emittedEvents = 0
  let finishReason = null
  let usage = null
  const pendingToolCalls = new Map()
  let reasoningContent = ''

  const emit = (text) => {
    const delta = String(text || '')
    if (!delta) return
    emittedChars += delta.length
    emittedEvents += 1
    if (typeof onDelta === 'function') onDelta(delta)
  }

  const processEvent = () => {
    if (eventLines.length === 0) return
    const payloadText = eventLines.join('\n').trim()
    eventLines = []
    if (!payloadText || payloadText === '[DONE]') return
    try {
      const payload = JSON.parse(payloadText)
      emit(extractTextFromAnthropicPayload(payload))
      const reasoningDelta = extractReasoningFromAnthropicPayload(payload)
      if (reasoningDelta) {
        reasoningContent += reasoningDelta
        options.onReasoningDelta?.(reasoningContent)
      }
      if (payload.type === 'content_block_start' && payload.content_block?.type === 'tool_use') {
        const index = Number.isFinite(Number(payload.index)) ? Number(payload.index) : pendingToolCalls.size
        pendingToolCalls.set(index, {
          id: String(payload.content_block.id || ''),
          type: 'function',
          name: String(payload.content_block.name || ''),
          arguments: payload.content_block.input && Object.keys(payload.content_block.input).length > 0
            ? JSON.stringify(payload.content_block.input)
            : ''
        })
      }
      if (payload.type === 'content_block_delta' && payload.delta?.type === 'input_json_delta') {
        const index = Number.isFinite(Number(payload.index)) ? Number(payload.index) : 0
        if (!pendingToolCalls.has(index)) {
          pendingToolCalls.set(index, { id: '', type: 'function', name: '', arguments: '' })
        }
        pendingToolCalls.get(index).arguments += String(payload.delta.partial_json || '')
      }
      const nextFinishReason = extractFinishReason(payload)
      if (nextFinishReason) finishReason = nextFinishReason
      if (payload.usage && typeof payload.usage === 'object') usage = payload.usage
      if (payload.message?.usage && typeof payload.message.usage === 'object') usage = payload.message.usage
    } catch {
      // Ignore malformed SSE frames and keep reading.
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    lineBuffer += decoder.decode(value, { stream: true })
    const lines = lineBuffer.split(/\r?\n/)
    lineBuffer = lines.pop() || ''
    for (const rawLine of lines) {
      const line = rawLine.trimEnd()
      if (line === '') {
        processEvent()
        continue
      }
      if (line.startsWith('data:')) {
        eventLines.push(line.slice(5).trimStart())
      }
    }
  }

  if (lineBuffer.trim().startsWith('data:')) {
    eventLines.push(lineBuffer.trimEnd().slice(5).trimStart())
  }
  processEvent()

  const toolCalls = [...pendingToolCalls.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, call]) => ({
      id: call.id,
      type: call.type,
      function: {
        name: call.name,
        arguments: call.arguments
      }
    }))
    .filter(call => call.id || call.function.name || call.function.arguments)

  return {
    emittedChars,
    emittedEvents,
    usedFallback: false,
    usage,
    finishReason,
    filteredReasoningChars: reasoningContent.length,
    reasoningContent: reasoningContent.trim(),
    toolCalls
  }
}

export function extractAnthropicNonStreamText(payload) {
  if (!payload || typeof payload !== 'object') return ''
  if (!Array.isArray(payload.content)) return ''
  return payload.content.map(part => {
    if (part?.type === 'text' && typeof part.text === 'string') return part.text
    return ''
  }).join('')
}

const ANTHROPIC_BODY_BLOCKLIST = new Set([
  'stream_options', 'reasoning_effort', 'logprobs', 'top_logprobs',
  'n', 'frequency_penalty', 'presence_penalty', 'response_format',
  'logit_bias', 'seed', 'parallel_tool_calls', 'service_tier'
])

export function sanitizeAnthropicBody(body) {
  if (!body || typeof body !== 'object') return body
  const sanitized = { ...body }
  for (const key of ANTHROPIC_BODY_BLOCKLIST) {
    delete sanitized[key]
  }
  if (sanitized.temperature != null && sanitized.top_p != null) {
    delete sanitized.top_p
  }
  return sanitized
}

export async function readAnthropicMessagesError(response, options = {}) {
  const { textLimit = DEFAULT_ERROR_TEXT_LIMIT } = options
  const fallback = `HTTP ${response?.status ?? ''}`.trim()
  if (!response) return fallback

  try {
    const payload = await response.clone().json()
    const message = payload?.error?.message || payload?.message || payload?.detail
    if (typeof message === 'string' && message.trim()) return message.trim()
  } catch {
    // Fall back to raw text.
  }

  try {
    const text = String(await response.clone().text() || '').trim()
    if (text) return text.slice(0, Math.max(1, textLimit))
  } catch {
    // Ignore raw text read failures.
  }

  return fallback
}
