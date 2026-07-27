import { parseOptionalMaxTokens, parseOptionalTemperature, normalizeReasoningEffort } from './chatCompletions'
import { buildOpenAICompatHeaders } from './openaiCompat'
import { createToolCallAccumulator } from './tools/toolCallAccumulator'

export function resolveOpenAIResponsesUrl(baseUrl) {
  const raw = String(baseUrl || '').trim().replace(/\/+$/, '')
  if (!raw) return '/v1/responses'
  if (/\/v1\/responses$/i.test(raw) || /\/responses$/i.test(raw)) return raw
  if (/\/v1$/i.test(raw)) return raw + '/responses'
  return raw + '/v1/responses'
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

function splitMessagesForResponses(messages) {
  const instructionParts = []
  const input = []

  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message || typeof message !== 'object') continue
    const role = String(message.role || '').trim()

    if (role === 'system') {
      instructionParts.push(extractTextFromContent(message.content))
      continue
    }

    if (role === 'user' || role === 'assistant' || role === 'developer') {
      input.push({ role, content: message.content })
      continue
    }

    if (role === 'tool') {
      input.push({
        type: 'function_call_output',
        call_id: String(message.tool_call_id || ''),
        output: extractTextFromContent(message.content)
      })
    }
  }

  return { instructions: instructionParts.join('\n\n').trim(), input }
}

export function buildOpenAIResponsesRequest(cfg = {}, messages = [], options = {}) {
  const split = splitMessagesForResponses(messages)
  const body = {
    model: cfg.model,
    stream: options.stream !== false
  }

  if (split.input.length > 0) body.input = split.input
  if (split.instructions) body.instructions = split.instructions

  const maxTokens = parseOptionalMaxTokens(options.maxTokens ?? options.max_tokens ?? cfg.maxTokens)
  if (maxTokens !== null) body.max_output_tokens = maxTokens

  const temperature = parseOptionalTemperature(cfg.temperature)
  if (temperature !== null) body.temperature = temperature

  const reasoningEffort = normalizeReasoningEffort(options.reasoningEffort ?? cfg?.reasoningEffort)
  if (reasoningEffort) {
    body.reasoning = { effort: reasoningEffort }
  }

  if (Array.isArray(options.tools) && options.tools.length > 0) {
    body.tools = options.tools.map(tool => {
      const fn = tool?.function || tool
      return {
        type: 'function',
        name: String(fn?.name || ''),
        description: String(fn?.description || ''),
        parameters: fn?.parameters || { type: 'object', properties: {} }
      }
    })
  }

  if (options.tool_choice) {
    body.tool_choice = options.tool_choice
  }

  const url = resolveOpenAIResponsesUrl(cfg.url)
  const headers = buildOpenAICompatHeaders(cfg.key)

  return { url, headers, body }
}

export function extractOpenAIResponsesNonStreamText(payload) {
  if (!payload || typeof payload !== 'object') return ''
  if (typeof payload.output_text === 'string') return payload.output_text
  if (Array.isArray(payload.output)) {
    return payload.output
      .filter(item => item?.type === 'message')
      .flatMap(item => Array.isArray(item.content) ? item.content : [])
      .filter(part => part?.type === 'output_text')
      .map(part => String(part.text || ''))
      .join('')
  }
  return ''
}

function extractOpenAIResponsesReasoningText(payload) {
  const response = payload?.response || payload
  if (!response || !Array.isArray(response.output)) return ''

  return response.output
    .filter(item => item?.type === 'reasoning')
    .flatMap(item => [
      ...(Array.isArray(item.summary) ? item.summary : []),
      ...(Array.isArray(item.content) ? item.content : [])
    ])
    .map(part => String(part?.text || part?.content || ''))
    .join('')
}

export async function consumeOpenAIResponsesStream(res, onDelta, options = {}) {
  const reader = res?.body?.getReader?.()
  if (!reader) throw new Error('当前环境不支持流式读取')

  const decoder = new TextDecoder()
  let lineBuffer = ''
  let eventType = ''
  let eventLines = []
  let emittedChars = 0
  let emittedEvents = 0
  let usage = null
  let finishReason = null
  const accumulator = createToolCallAccumulator()
  let reasoningContent = ''

  const emit = (text) => {
    const delta = String(text || '')
    if (!delta) return
    emittedChars += delta.length
    emittedEvents += 1
    if (typeof onDelta === 'function') onDelta(delta)
  }

  const processEvent = () => {
    if (eventLines.length === 0) { eventType = ''; return }
    const payloadText = eventLines.join('\n').trim()
    eventLines = []
    const currentEventType = eventType
    eventType = ''
    if (!payloadText || payloadText === '[DONE]') return

    try {
      const payload = JSON.parse(payloadText)
      const type = payload.type || currentEventType

      if (type === 'response.output_text.delta') {
        emit(typeof payload.delta === 'string' ? payload.delta : '')
      } else if (type === 'response.reasoning_summary_text.delta' || type === 'response.reasoning_text.delta') {
        reasoningContent += typeof payload.delta === 'string' ? payload.delta : ''
        if (reasoningContent) options.onReasoningDelta?.(reasoningContent)
      } else if (type === 'response.function_call_arguments.delta') {
        const index = Number.isFinite(Number(payload.output_index)) ? Number(payload.output_index) : 0
        const callId = String(payload.item_id || payload.call_id || '')
        const name = String(payload.name || '')
        const argDelta = typeof payload.delta === 'string' ? payload.delta : ''
        accumulator.push([{
          index,
          id: callId,
          function: { name: name || undefined, arguments: argDelta }
        }])
      } else if (type === 'response.function_call_arguments.done') {
        // final arguments are already accumulated
      } else if (type === 'response.output_item.added') {
        if (payload.item?.type === 'function_call') {
          const index = Number.isFinite(Number(payload.output_index)) ? Number(payload.output_index) : 0
          accumulator.push([{
            index,
            id: String(payload.item.call_id || payload.item.id || ''),
            function: { name: String(payload.item.name || ''), arguments: '' }
          }])
        }
      } else if (type === 'response.completed') {
        const resp = payload.response || payload
        if (!reasoningContent) {
          reasoningContent = extractOpenAIResponsesReasoningText(resp)
          if (reasoningContent) options.onReasoningDelta?.(reasoningContent)
        }
        if (resp.usage && typeof resp.usage === 'object') usage = resp.usage
        finishReason = resp.status === 'completed' ? 'stop' : (resp.status || null)
      }
    } catch {
      // Ignore malformed SSE frames
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
      if (line.startsWith('event:')) {
        eventType = line.slice(6).trimStart()
        continue
      }
      if (line.startsWith('data:')) {
        eventLines.push(line.slice(5).trimStart())
      }
    }
  }

  if (lineBuffer.trim()) {
    const line = lineBuffer.trimEnd()
    if (line.startsWith('data:')) {
      eventLines.push(line.slice(5).trimStart())
    }
  }
  processEvent()

  const toolCalls = accumulator.hasToolCalls() ? accumulator.getCompleted() : []

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

export { readOpenAICompatError as readOpenAIResponsesError } from './openaiCompat'
