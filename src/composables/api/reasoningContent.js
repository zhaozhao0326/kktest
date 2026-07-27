const REASONING_TAGS = Object.freeze(['think', 'thinking', 'reasoning', 'analysis'])
const REASONING_TAG_PATTERN = REASONING_TAGS.join('|')
const REASONING_OPEN_TAG_REGEX = new RegExp(`<\\s*(${REASONING_TAG_PATTERN})\\b[^>]*>`, 'i')
const REASONING_COMPLETE_TAG_REGEX = new RegExp(`<\\s*(${REASONING_TAG_PATTERN})\\b[^>]*>([\\s\\S]*?)<\\s*\\/\\s*\\1\\s*>`, 'gi')
const REASONING_UNCLOSED_TAG_REGEX = new RegExp(`<\\s*(${REASONING_TAG_PATTERN})\\b[^>]*>([\\s\\S]*)$`, 'i')
const REASONING_FENCE_REGEX = /```(?:think|thinking|reasoning|analysis)\b[^\n]*\n?([\s\S]*?)```/gi
const LEADING_REASONING_LABEL_REGEX = /^\s*(?:thought|thinking|reasoning|analysis|chain\s+of\s+thought|思考过程|思维链|推理过程)\s*[:：][\s\S]*?(?=(?:\n|\r\n?)\s*(?:answer|final\s+answer|回复|正文)\s*[:：]|\n\s*\n|$)/i
const FINAL_ANSWER_LABEL_REGEX = /^\s*(?:answer|final\s+answer|回复|正文)\s*[:：]\s*/i
const LEADING_REASONING_STREAM_LABEL_REGEX = /^\s*(?:thought|thinking|reasoning|analysis|chain\s+of\s+thought|思考过程|思维链|推理过程)\s*[:：]/i
const FINAL_ANSWER_STREAM_LABEL_REGEX = /(?:^|\r?\n)\s*(?:answer|final\s+answer|回复|正文)\s*[:：]\s*/i
const REASONING_PART_TYPE_REGEX = /^(?:reasoning|reasoning_text|reasoning_content|thinking|thought|analysis)$/i
const PART_TEXT_KEYS = Object.freeze(['text', 'content'])
const LEADING_REASONING_LABELS = Object.freeze([
  'thought',
  'thinking',
  'reasoning',
  'analysis',
  'chain of thought',
  '思考过程',
  '思维链',
  '推理过程'
])
const REASONING_TEXT_KEYS = Object.freeze([
  'reasoning',
  'reasoning_content',
  'reasoningContent',
  'thinking',
  'thinking_content',
  'thought',
  'thoughts',
  'analysis'
])

function normalizeText(value) {
  return typeof value === 'string' ? value : String(value ?? '')
}

function countRemovedChars(before, after) {
  return Math.max(0, normalizeText(before).length - normalizeText(after).length)
}

function normalizeWhitespaceAfterCleaning(text) {
  return normalizeText(text)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function getPartType(part) {
  return normalizeText(part?.type || '').trim()
}

function extractTextFromParts(content, options = {}) {
  const { includeReasoningParts = false } = options
  if (!Array.isArray(content)) return ''

  return content.map(part => {
    if (typeof part === 'string') return part
    if (!part || typeof part !== 'object') return ''

    const partType = getPartType(part)
    if (!includeReasoningParts && REASONING_PART_TYPE_REGEX.test(partType)) return ''

    for (const key of PART_TEXT_KEYS) {
      if (typeof part[key] === 'string') return part[key]
    }
    return ''
  }).join('')
}

export function extractVisibleTextFromContent(content) {
  if (typeof content === 'string') return content
  return extractTextFromParts(content, { includeReasoningParts: false })
}

export function extractReasoningTextFromPayloadPart(part) {
  if (!part || typeof part !== 'object') return ''

  const partType = getPartType(part)
  if (REASONING_PART_TYPE_REGEX.test(partType)) {
    return extractTextFromParts([part], { includeReasoningParts: true })
  }

  return REASONING_TEXT_KEYS.map(key => (
    typeof part[key] === 'string' ? part[key] : ''
  )).filter(Boolean).join('')
}

export function extractReasoningTextFromChoice(choice) {
  if (!choice || typeof choice !== 'object') return ''

  const segments = []
  const collect = (source) => {
    if (!source || typeof source !== 'object') return
    for (const key of REASONING_TEXT_KEYS) {
      if (typeof source[key] === 'string') segments.push(source[key])
    }
    const content = source.content
    if (Array.isArray(content)) {
      content.forEach(part => {
        const text = extractReasoningTextFromPayloadPart(part)
        if (text) segments.push(text)
      })
    }
  }

  collect(choice.delta)
  collect(choice.message)
  collect(choice)
  return segments.join('')
}

export function cleanReasoningContent(value) {
  let text = normalizeText(value)
  if (!text) {
    return {
      text: '',
      reasoningContent: '',
      removedChars: 0,
      changed: false
    }
  }

  const before = text
  let removedReasoning = false
  const reasoningSegments = []
  const collectReasoning = (value) => {
    const reasoningText = normalizeWhitespaceAfterCleaning(value)
    if (reasoningText) reasoningSegments.push(reasoningText)
  }
  const removeReasoningMatch = (reasoningText) => {
    removedReasoning = true
    collectReasoning(reasoningText)
    return ''
  }
  text = text.replace(REASONING_FENCE_REGEX, (match, content) => removeReasoningMatch(content))
  text = text.replace(REASONING_COMPLETE_TAG_REGEX, (match, tag, content) => removeReasoningMatch(content))
  text = text.replace(REASONING_UNCLOSED_TAG_REGEX, (match, tag, content) => removeReasoningMatch(content))
  text = text.replace(LEADING_REASONING_LABEL_REGEX, (match) => (
    removeReasoningMatch(match.replace(LEADING_REASONING_STREAM_LABEL_REGEX, ''))
  ))
  text = text.replace(FINAL_ANSWER_LABEL_REGEX, '')
  text = normalizeWhitespaceAfterCleaning(text)

  return {
    text,
    reasoningContent: reasoningSegments.join('\n\n'),
    removedChars: removedReasoning ? countRemovedChars(before, text) : 0,
    changed: removedReasoning || text !== before
  }
}

function findCloseTag(text, tag) {
  const escapedTag = String(tag || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`<\\s*\\/\\s*${escapedTag}\\s*>`, 'i')
  const match = regex.exec(text)
  if (!match) return null
  return {
    index: match.index,
    end: match.index + match[0].length
  }
}

function getPartialOpenTagIndex(text) {
  const raw = normalizeText(text)
  const lastOpen = raw.lastIndexOf('<')
  if (lastOpen < 0) return -1

  const suffix = raw.slice(lastOpen)
  if (suffix.length > 32) return -1
  if (!/^<\s*(?:t|th|thi|thin|think|thinking|r|re|rea|reas|reaso|reason|reasoni|reasonin|reasoning|a|an|ana|anal|analy|analys|analysi|analysis)?$/i.test(suffix)) {
    return -1
  }
  return lastOpen
}

function isPossibleLeadingReasoningLabelPrefix(text) {
  const compact = normalizeText(text).trimStart().toLowerCase().replace(/\s+/g, ' ')
  if (!compact) return true
  if (compact.length > 48) return false
  if (compact.includes(':') || compact.includes('：')) return false
  return LEADING_REASONING_LABELS.some(label => label.startsWith(compact) || compact === label)
}

export function createReasoningContentFilter(options = {}) {
  const onFiltered = typeof options.onFiltered === 'function' ? options.onFiltered : null
  const onReasoning = typeof options.onReasoning === 'function' ? options.onReasoning : null
  let buffer = ''
  let skippingTag = ''
  let skippingLeadingLabel = false
  let hasEmittedVisible = false
  let removedChars = 0
  let reasoningText = ''

  const appendReasoning = (value) => {
    const text = normalizeText(value)
    if (!text) return
    reasoningText += text
    onReasoning?.(text)
  }

  const noteRemoved = (count, reason) => {
    const n = Math.max(0, Number(count) || 0)
    if (n <= 0) return
    removedChars += n
    onFiltered?.({ removedChars: n, reason })
  }

  const drain = (final = false) => {
    let output = ''
    const appendOutput = (text) => {
      if (!text) return
      output += text
      if (String(text).trim()) hasEmittedVisible = true
    }

    while (buffer) {
      if (skippingTag) {
        const close = findCloseTag(buffer, skippingTag)
        if (!close) {
          appendReasoning(buffer)
          noteRemoved(buffer.length, 'reasoning-tag-stream')
          buffer = ''
          return output
        }
        appendReasoning(buffer.slice(0, close.index))
        noteRemoved(close.end, 'reasoning-tag-stream')
        buffer = buffer.slice(close.end)
        skippingTag = ''
        continue
      }

      if (skippingLeadingLabel) {
        const finalAnswerMatch = FINAL_ANSWER_STREAM_LABEL_REGEX.exec(buffer)
        if (!finalAnswerMatch) {
          appendReasoning(buffer)
          noteRemoved(buffer.length, 'reasoning-label-stream')
          buffer = ''
          return output
        }
        appendReasoning(buffer.slice(0, finalAnswerMatch.index))
        const removedUntil = finalAnswerMatch.index + finalAnswerMatch[0].length
        noteRemoved(removedUntil, 'reasoning-label-stream')
        buffer = buffer.slice(removedUntil)
        skippingLeadingLabel = false
        continue
      }

      if (!hasEmittedVisible) {
        const finalAnswerAtStart = buffer.match(FINAL_ANSWER_LABEL_REGEX)
        if (finalAnswerAtStart) {
          noteRemoved(finalAnswerAtStart[0].length, 'final-answer-label-stream')
          buffer = buffer.slice(finalAnswerAtStart[0].length)
          continue
        }

        const leadingReasoningLabel = buffer.match(LEADING_REASONING_STREAM_LABEL_REGEX)
        if (leadingReasoningLabel) {
          noteRemoved(leadingReasoningLabel[0].length, 'reasoning-label-stream')
          buffer = buffer.slice(leadingReasoningLabel[0].length)
          skippingLeadingLabel = true
          continue
        }

        if (!final && isPossibleLeadingReasoningLabelPrefix(buffer)) {
          return output
        }
      }

      const openMatch = REASONING_OPEN_TAG_REGEX.exec(buffer)
      if (!openMatch) {
        const partialIndex = final ? -1 : getPartialOpenTagIndex(buffer)
        if (partialIndex >= 0) {
          appendOutput(buffer.slice(0, partialIndex))
          buffer = buffer.slice(partialIndex)
          return output
        }
        appendOutput(buffer)
        buffer = ''
        return output
      }

      appendOutput(buffer.slice(0, openMatch.index))
      const tag = openMatch[1].toLowerCase()
      const afterOpen = buffer.slice(openMatch.index + openMatch[0].length)
      const close = findCloseTag(afterOpen, tag)

      if (!close) {
        appendReasoning(afterOpen)
        noteRemoved(buffer.length - openMatch.index, 'reasoning-tag-stream')
        buffer = ''
        skippingTag = tag
        return output
      }

      const removedUntil = openMatch.index + openMatch[0].length + close.end
      appendReasoning(afterOpen.slice(0, close.index))
      noteRemoved(removedUntil - openMatch.index, 'reasoning-tag-stream')
      buffer = buffer.slice(removedUntil)
    }

    return output
  }

  return {
    push(delta) {
      const piece = normalizeText(delta)
      if (!piece) return ''
      buffer += piece
      return drain(false)
    },
    flush() {
      return drain(true)
    },
    getRemovedChars() {
      return removedChars
    },
    getReasoningText() {
      return normalizeWhitespaceAfterCleaning(reasoningText)
    }
  }
}
