// Utilities for consuming OpenAI-compatible streaming responses (SSE over fetch).
// The server usually sends "data: {json}\n\n" and ends with "data: [DONE]".

import {
  cleanReasoningContent,
  createReasoningContentFilter,
  extractReasoningTextFromChoice,
  extractVisibleTextFromContent
} from './reasoningContent'

function extractTextFromChoice(choice) {
  if (!choice || typeof choice !== 'object') return ''

  const deltaContent = choice?.delta?.content
  const deltaText = extractVisibleTextFromContent(deltaContent)
  if (deltaText) return deltaText

  const msgContent = choice?.message?.content
  const messageText = extractVisibleTextFromContent(msgContent)
  if (messageText) return messageText

  return ''
}

function extractTextFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return ''

  const firstChoice = payload?.choices?.[0]
  const fromChoice = extractTextFromChoice(firstChoice)
  if (fromChoice) return fromChoice

  if (typeof payload.output_text === 'string') return payload.output_text
  if (typeof payload.text === 'string') return payload.text
  return ''
}

function createStreamingTextAccumulator() {
  let text = ''
  let lastChunk = ''

  return {
    getText() {
      return text
    },
    push(delta) {
      const piece = String(delta || '')
      if (!piece) return text
      if (text && piece.startsWith(text)) {
        text = piece
      } else if (!(piece === lastChunk && text.endsWith(piece))) {
        text += piece
      }
      lastChunk = piece
      return text
    }
  }
}

function mergeReasoningText(...values) {
  const unique = []
  values.forEach(value => {
    const text = String(value || '').trim()
    if (text && !unique.includes(text)) unique.push(text)
  })
  return unique.join('\n\n')
}

/**
 * Consume a streamed /chat/completions response and emit text deltas.
 * Returns parse diagnostics to help callers distinguish protocol issues.
 *
 * @param {Response} res fetch() response
 * @param {(delta: string) => void} onDelta called for every delta chunk
 * @returns {Promise<{emittedChars:number,emittedEvents:number,usedFallback:boolean}>}
 */
export async function consumeChatCompletionsStream(res, onDelta, options = {}) {
  const reader = res?.body?.getReader?.()
  if (!reader) {
    throw new Error('当前环境不支持流式读取')
  }

  const decoder = new TextDecoder()
  let lineBuffer = ''
  let rawText = ''
  let eventLines = []
  let emittedChars = 0
  let emittedEvents = 0
  let usage = null
  let finishReason = null

  const reasoningAccumulator = createStreamingTextAccumulator()
  let filteredReasoningChars = 0
  let reasoningFilter = null
  const notifyReasoning = () => {
    const reasoningContent = mergeReasoningText(
      reasoningAccumulator.getText(),
      reasoningFilter?.getReasoningText()
    )
    if (reasoningContent && typeof options.onReasoningDelta === 'function') {
      options.onReasoningDelta(reasoningContent)
    }
  }
  reasoningFilter = createReasoningContentFilter({ onReasoning: notifyReasoning })

  const emitText = (text) => {
    if (!text || typeof text !== 'string') return
    const visibleText = reasoningFilter.push(text)
    if (!visibleText) return
    emittedChars += visibleText.length
    emittedEvents += 1
    if (typeof onDelta === 'function') onDelta(visibleText)
  }

  const noteReasoningText = (choice) => {
    const reasoningText = extractReasoningTextFromChoice(choice)
    if (!reasoningText) return
    filteredReasoningChars += reasoningText.length
    reasoningAccumulator.push(reasoningText)
    notifyReasoning()
  }

  const processEvent = () => {
    if (eventLines.length === 0) return
    const payloadText = eventLines.join('\n').trim()
    eventLines = []
    if (!payloadText || payloadText === '[DONE]') return

    try {
      const payload = JSON.parse(payloadText)
      const firstChoice = payload?.choices?.[0]
      noteReasoningText(firstChoice)
      emitText(extractTextFromPayload(payload))
      const choiceFinish = payload?.choices?.[0]?.finish_reason
      if (choiceFinish) finishReason = choiceFinish
      if (payload.usage && typeof payload.usage === 'object') {
        usage = payload.usage
      }
    } catch {
      // Ignore invalid payload frames and continue parsing subsequent frames.
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value, { stream: true })
    rawText += chunk
    lineBuffer += chunk

    const lines = lineBuffer.split(/\r?\n/)
    lineBuffer = lines.pop() || ''

    for (const rawLine of lines) {
      const line = rawLine.trimEnd()
      if (line === '') {
        processEvent()
        continue
      }
      if (!line.startsWith('data:')) continue
      eventLines.push(line.slice(5).trimStart())
    }
  }

  if (lineBuffer.trim()) {
    const line = lineBuffer.trimEnd()
    if (line.startsWith('data:')) {
      eventLines.push(line.slice(5).trimStart())
    }
  }
  processEvent()

  const trailingVisibleText = reasoningFilter.flush()
  if (trailingVisibleText) {
    emittedChars += trailingVisibleText.length
    emittedEvents += 1
    if (typeof onDelta === 'function') onDelta(trailingVisibleText)
  }
  filteredReasoningChars += reasoningFilter.getRemovedChars()

  let usedFallback = false
  if (emittedChars === 0) {
    const text = rawText.trim()
    if (text) {
      try {
        const payload = JSON.parse(text)
        const firstChoice = payload?.choices?.[0]
        noteReasoningText(firstChoice)
        const cleanedFallback = cleanReasoningContent(extractTextFromPayload(payload))
        if (cleanedFallback.removedChars > 0) filteredReasoningChars += cleanedFallback.removedChars
        reasoningAccumulator.push(cleanedFallback.reasoningContent)
        notifyReasoning()
        if (cleanedFallback.text) {
          usedFallback = true
          emittedChars += cleanedFallback.text.length
          emittedEvents += 1
          if (typeof onDelta === 'function') onDelta(cleanedFallback.text)
        }
        const choiceFinish = payload?.choices?.[0]?.finish_reason
        if (choiceFinish) finishReason = choiceFinish
        if (payload.usage && typeof payload.usage === 'object') {
          usage = payload.usage
        }
      } catch {
        // Non-JSON fallback ignored.
      }
    }
  }

  return {
    emittedChars,
    emittedEvents,
    usedFallback,
    usage,
    finishReason,
    filteredReasoningChars,
    reasoningContent: mergeReasoningText(reasoningAccumulator.getText(), reasoningFilter.getReasoningText())
  }
}
