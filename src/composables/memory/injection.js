import { trimToMaxTokens } from '../../utils/tokens'
import { normalizeSearchText } from '../../utils/searchText'
import {
  CATEGORY_LABELS,
  DEFAULT_MEMORY_SETTINGS,
  getNewTextMessages,
  initContactMemory,
  isExpiredCoreMemory,
  renderMemoryText
} from './shared'

function getDefaultRecentSummaries(memory) {
  const result = []
  const recentLong = (memory.longTerm || []).filter(s => s && s.content && s.status !== 'failed').slice(-1)
  result.push(...recentLong)
  const recentShort = (memory.shortTerm || []).filter(s => s && !s.merged && s.content && s.status !== 'failed').slice(-2)
  result.push(...recentShort)
  return result
}

function getRecentTextMessages(contact, maxCount = 6) {
  return (Array.isArray(contact?.msgs) ? contact.msgs : [])
    .filter(message => {
      if (!message) return false
      if (message.hideInChat) return false
      if (message.isImage || message.isSticker) return false
      return typeof message.content === 'string' && !!message.content.trim()
    })
    .slice(-maxCount)
}

function extractSearchTerms(text) {
  const normalized = normalizeSearchText(text)
  if (!normalized) return new Set()

  const set = new Set()
  const lowerAscii = normalized.toLowerCase().split(/[^a-z0-9]+/i).filter(term => term.length >= 2)
  lowerAscii.forEach(term => set.add(term))

  const compact = normalized.replace(/\s+/g, '')
  const phrases = compact.match(/[\u4e00-\u9fff]{2,}/g) || []
  phrases.forEach((phrase) => {
    const trimmed = phrase.trim()
    if (!trimmed) return
    if (trimmed.length <= 12) set.add(trimmed)
    for (let i = 0; i < trimmed.length - 1; i += 1) {
      set.add(trimmed.slice(i, i + 2))
    }
  })

  return set
}

function computeOverlapScore(queryTerms, memoryTerms, maxScore) {
  if (!queryTerms?.size || !memoryTerms?.size || maxScore <= 0) return 0
  let overlap = 0
  for (const term of memoryTerms) {
    if (queryTerms.has(term)) overlap += 1
  }
  const ratio = overlap / Math.max(1, memoryTerms.size)
  return Math.min(maxScore, Math.round(ratio * maxScore))
}

function getPriorityWeight(priority) {
  if (priority === 'high') return 120
  if (priority === 'low') return 35
  return 70
}

function getCategoryBonus(category) {
  if (category === 'relationship') return 18
  if (category === 'people') return 10
  return 0
}

function getConfidenceBonus(confidence) {
  if (confidence === 'high') return 18
  if (confidence === 'medium') return 8
  if (confidence === 'low') return -8
  return 0
}

function getSourceBonus(source) {
  if (source === 'manual') return 10
  if (source === 'keyword') return 8
  if (source === 'promoted') return 8
  if (source === 'manager') return 6
  return 0
}

function getDaysSince(timestamp, now) {
  const value = Number(timestamp || 0)
  if (!Number.isFinite(value) || value <= 0) return Number.POSITIVE_INFINITY
  return Math.floor((now - value) / (24 * 60 * 60 * 1000))
}

function getRecencyBonus(memory, now) {
  const days = getDaysSince(memory.lastConfirmedAt || memory.time, now)
  if (days <= 7) return 12
  if (days <= 30) return 7
  if (days <= 90) return 3
  return 0
}

function getRecallBonus(memory, now) {
  const days = getDaysSince(memory.lastRecalledAt, now)
  if (days <= 7) return 8
  if (days <= 30) return 4
  return 0
}

function getStalePenalty(memory, now) {
  if (memory.confidence !== 'low') return 0
  const days = getDaysSince(memory.lastConfirmedAt || memory.time, now)
  if (days > 180) return 12
  if (days > 90) return 6
  return 0
}

function buildInjectionContext(contact) {
  const recentMessages = getRecentTextMessages(contact, 6)
  const latestUserMessage = [...recentMessages].reverse().find(message => message.role === 'user') || null
  const latestUserText = normalizeSearchText(latestUserMessage?.content || '')
  const recentText = recentMessages
    .map(message => normalizeSearchText(message.content))
    .filter(Boolean)
    .join('\n')

  return {
    latestUserText,
    recentText,
    latestUserTerms: extractSearchTerms(latestUserText),
    recentTerms: extractSearchTerms(recentText)
  }
}

function scoreMemoryForInjection(memory, renderedContent, context, now) {
  const memoryTerms = extractSearchTerms(renderedContent)
  const renderedEntity = normalizeSearchText(memory.entity || '')
  const latestUserText = context.latestUserText || ''
  const recentText = context.recentText || ''

  let score = 0
  score += getPriorityWeight(memory.priority)
  score += getCategoryBonus(memory.category)
  score += getConfidenceBonus(memory.confidence)
  score += getSourceBonus(memory.source)
  score += getRecencyBonus(memory, now)
  score += getRecallBonus(memory, now)
  score -= getStalePenalty(memory, now)

  if (renderedEntity) {
    if (latestUserText.includes(renderedEntity)) score += 42
    else if (recentText.includes(renderedEntity)) score += 24
  }

  score += computeOverlapScore(context.latestUserTerms, memoryTerms, 36)
  score += computeOverlapScore(context.recentTerms, memoryTerms, 18)
  return score
}

function sortSelectedMemories(a, b) {
  if (b.score !== a.score) return b.score - a.score
  return (b.memory?.time || 0) - (a.memory?.time || 0)
}

function collectSelectedCoreMemories(contact, deps = {}) {
  const { store } = deps
  const render = (text) => renderMemoryText(text, contact, store)
  const now = Date.now()
  const context = buildInjectionContext(contact)

  const eligible = (contact.memory?.core || [])
    .filter(memory => memory && memory.enabled && memory.content && !isExpiredCoreMemory(memory, now))
    .map((memory) => {
      const renderedContent = render(memory.content).trim()
      if (!renderedContent) return null
      return {
        memory,
        renderedContent,
        score: scoreMemoryForInjection(memory, renderedContent, context, now)
      }
    })
    .filter(Boolean)

  if (eligible.length === 0) {
    return { stable: [], relevant: [] }
  }

  const stable = eligible
    .filter(item => item.memory.priority === 'high' || item.memory.category === 'relationship')
    .sort(sortSelectedMemories)
    .slice(0, 3)

  const selectedIds = new Set(stable.map(item => item.memory.id))
  const relevantThreshold = context.latestUserText ? 116 : 124
  let relevant = eligible
    .filter(item => !selectedIds.has(item.memory.id))
    .filter(item => item.score >= relevantThreshold)
    .sort(sortSelectedMemories)
    .slice(0, 4)

  if (stable.length === 0 && relevant.length === 0) {
    relevant = eligible
      .slice()
      .sort(sortSelectedMemories)
      .slice(0, 2)
  }

  const recallTime = now
  for (const item of [...stable, ...relevant]) {
    item.memory.recallCount = Math.max(0, Number(item.memory.recallCount || 0) || 0) + 1
    item.memory.lastRecalledAt = recallTime
  }

  return { stable, relevant }
}

function formatMemoryLines(items) {
  const categorized = {}
  const uncategorized = []

  for (const item of items) {
    const cat = item.memory?.category
    const rendered = String(item.renderedContent || '').trim()
    if (!rendered) continue
    if (cat && CATEGORY_LABELS[cat]) {
      if (!categorized[cat]) categorized[cat] = []
      categorized[cat].push(rendered)
    } else {
      uncategorized.push(rendered)
    }
  }

  const lines = []
  for (const [cat, label] of Object.entries(CATEGORY_LABELS)) {
    if (categorized[cat]?.length) {
      lines.push(label + ': ' + categorized[cat].join('、'))
    }
  }
  for (const line of uncategorized) {
    lines.push('- ' + line)
  }
  return lines
}

// 检查是否需要自动总结
export function checkAutoSummaryTrigger(contact) {
  const settings = contact?.memorySettings
  if (!settings?.enabled || !settings?.autoSummary) return false

  initContactMemory(contact)
  const newTextMsgs = getNewTextMessages(contact, null)

  return newTextMsgs.length >= settings.summaryFrequency
}

// 构建摘要索引（AM编码 + 一行概要）
export function buildSummaryIndex(contact, deps = {}) {
  const { store } = deps
  if (!contact?.memory) return ''
  const render = (text) => renderMemoryText(text, contact, store)

  const allSummaries = [
    ...(contact.memory.longTerm || []),
    ...(contact.memory.shortTerm || [])
  ].filter(s => s && s.amCode && s.content && s.status !== 'failed' && !s.merged)
   .sort((a, b) => (a.time || 0) - (b.time || 0))

  if (!allSummaries.length) return ''

  const lines = allSummaries.map(s => {
    const text = render(s.content).trim()
    // Truncate to ~40 chars for index line
    const preview = text.length > 40 ? text.slice(0, 40).trimEnd() + '...' : text
    return `${s.amCode}: ${preview}`
  })

  return lines.join('\n')
}

// 构建记忆注入提示词（结构化分类输出，使用 {{char}}/{{user}} 模板变量）
export function buildMemoryPrompt(contact, deps = {}) {
  const { store } = deps
  if (!contact) return ''
  initContactMemory(contact)

  const memory = contact.memory
  const settings = contact.memorySettings || DEFAULT_MEMORY_SETTINGS
  if (!settings.enabled || !memory) return ''

  const maxTokens = settings.maxInjectTokens || DEFAULT_MEMORY_SETTINGS.maxInjectTokens
  const parts = []
  const render = (text) => renderMemoryText(text, contact, store)

  const { stable, relevant } = collectSelectedCoreMemories(contact, deps)
  if (stable.length || relevant.length) {
    parts.push('以下是你对这个人的长期记忆。只在相关时自然融入，不要逐条复述。')

    const stableLines = formatMemoryLines(stable)
    if (stableLines.length) {
      parts.push('[关系与稳定设定]\n' + stableLines.join('\n'))
    }

    const relevantLines = formatMemoryLines(relevant)
    if (relevantLines.length) {
      parts.push('[当前相关记忆]\n' + relevantLines.join('\n'))
    }

    // Summary index (compact AM-coded overview) + recent detailed summaries
    const summaryIndex = buildSummaryIndex(contact, deps)
    if (summaryIndex) {
      parts.push('[记忆摘要索引]\n' + summaryIndex)
    }

    const detailedSummaries = getDefaultRecentSummaries(memory)
    const summaryParts = detailedSummaries.map(m => {
      const prefix = m.amCode ? `${m.amCode}: ` : ''
      return prefix + render(m.content)
    }).filter(Boolean)
    if (summaryParts.length) {
      parts.push('[之前聊过的]\n' + summaryParts.join('\n'))
    }

    return trimToMaxTokens(parts.join('\n\n'), maxTokens)
  }

  // No core memories; fallback to summaries only (if any).
  const summaryIndex = buildSummaryIndex(contact, deps)
  if (summaryIndex) {
    parts.push('[记忆摘要索引]\n' + summaryIndex)
  }

  const detailedSummaries = getDefaultRecentSummaries(memory)
  const summaryParts = detailedSummaries.map(m => {
    const prefix = m.amCode ? `${m.amCode}: ` : ''
    return prefix + render(m.content)
  }).filter(Boolean)
  if (summaryParts.length) {
    parts.push('[概要]\n' + summaryParts.join('\n'))
  }

  return trimToMaxTokens(parts.join('\n\n'), maxTokens)
}
