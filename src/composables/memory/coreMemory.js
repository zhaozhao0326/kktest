import { makeId } from '../../utils/id'
import {
  CATEGORY_LABELS,
  confirmCoreMemory,
  DEFAULT_MEMORY_SETTINGS,
  escapeRegExp,
  getDefaultMemoryConfidence,
  getLowConfidenceMemoryExpiry,
  initContactMemory,
  isValidMemoryConfidence,
  isValidMemoryEntityType,
  normalizeMemoryContent,
  normalizeMemoryEntity,
  pickHigherMemoryConfidence,
  PRIORITY_ORDER,
  shouldAutoEnableMemoryByConfidence,
  upgradeMemoryConfidenceByExtractionCount
} from './shared'

// 检查关键词触发
export function checkKeywordTrigger(content, contact) {
  const settings = contact?.memorySettings || DEFAULT_MEMORY_SETTINGS
  if (!settings.keywordTrigger || !settings.keywords?.length) return null
  if (typeof content !== 'string') return null

  const lowerContent = content.toLowerCase()
  for (const keyword of settings.keywords) {
    const kw = String(keyword || '').trim()
    if (!kw) continue
    if (!lowerContent.includes(kw.toLowerCase())) continue

    // 1) 关键词在行首：允许紧跟内容（兼容 “记住我喜欢猫” 这种写法），支持多行内容。
    const startRegex = new RegExp('^\\s*' + escapeRegExp(kw) + '(?:[：:,，]\\s*|\\s*)?([\\s\\S]+)$', 'i')
    const startMatch = content.match(startRegex)
    if (startMatch && startMatch[1]?.trim()) return startMatch[1].trim()

    // 2) 关键词在句中：要求至少有一个分隔符（标点或空格），避免 “我记得你...” 误触发。
    const midRegex = new RegExp(escapeRegExp(kw) + '(?:[：:,，]\\s*|\\s+)([\\s\\S]+)$', 'i')
    const midMatch = content.match(midRegex)
    if (midMatch && midMatch[1]?.trim()) return midMatch[1].trim()
  }
  return null
}

// 添加核心记忆（自动去重：同内容只更新时间/优先级）
export function addCoreMemory(contact, content, source = 'manual', extra = {}) {
  initContactMemory(contact)

  const normalized = normalizeMemoryContent(content)
  if (!normalized) return null
  const now = Date.now()

  const existing = contact.memory.core.find(m => normalizeMemoryContent(m?.content) === normalized)
  if (existing) {
    existing.content = String(content || '').trim()
    existing.time = now

    const forceEnableSource = source === 'manual' || source === 'keyword' || source === 'manager'
    const canDisableExisting = (existing.source === 'extracted' || !existing.source) && existing.enabled !== true
    if (forceEnableSource) {
      existing.enabled = true
    } else if (source === 'extracted') {
      if (extra && typeof extra === 'object' && typeof extra.enabled === 'boolean') {
        if (extra.enabled) {
          existing.enabled = true
        } else if (canDisableExisting) {
          existing.enabled = false
        }
      }
    } else if (typeof existing.enabled !== 'boolean') {
      existing.enabled = true
    }

    if (source === 'manual') existing.source = 'manual'
    else if (source === 'manager') existing.source = 'manager'
    else if (!existing.source) existing.source = source

    if (extra && typeof extra === 'object') {
      if (extra.priority && PRIORITY_ORDER[extra.priority] != null) {
        const cur = PRIORITY_ORDER[existing.priority] ?? 1
        const next = PRIORITY_ORDER[extra.priority] ?? 1
        if (next < cur) existing.priority = extra.priority
      }
      if (extra.category && CATEGORY_LABELS[extra.category]) {
        existing.category = extra.category
      }
    }

    const entity = normalizeMemoryEntity(extra?.entity)
    if (entity) existing.entity = entity
    if (isValidMemoryEntityType(extra?.entityType)) existing.entityType = extra.entityType

    if (source === 'extracted') {
      existing.extractionCount = Math.max(0, Number(existing.extractionCount || 0) || 0) + 1
      const incomingConfidence = isValidMemoryConfidence(extra?.confidence)
        ? extra.confidence
        : getDefaultMemoryConfidence(source, existing.enabled)
      let nextConfidence = isValidMemoryConfidence(existing.confidence)
        ? pickHigherMemoryConfidence(existing.confidence, incomingConfidence)
        : incomingConfidence
      nextConfidence = upgradeMemoryConfidenceByExtractionCount(nextConfidence, existing.extractionCount)
      existing.confidence = nextConfidence

      if (shouldAutoEnableMemoryByConfidence(nextConfidence)) {
        existing.enabled = true
        existing.expiresAt = null
        existing.lastConfirmedAt = now
      } else if (nextConfidence === 'low' && !existing.lastConfirmedAt) {
        existing.expiresAt = existing.expiresAt || getLowConfidenceMemoryExpiry(now)
      } else {
        existing.expiresAt = null
      }
    } else {
      const existingConfidence = isValidMemoryConfidence(existing.confidence)
        ? existing.confidence
        : getDefaultMemoryConfidence(source, existing.enabled)
      const incomingConfidence = isValidMemoryConfidence(extra?.confidence)
        ? extra.confidence
        : existingConfidence
      existing.confidence = pickHigherMemoryConfidence(existingConfidence, incomingConfidence)
      existing.expiresAt = null
      existing.lastConfirmedAt = now
    }

    return existing
  }

  const explicitEnabled = typeof extra?.enabled === 'boolean' ? extra.enabled : null
  const memory = {
    id: makeId('mem'),
    content: String(content || '').trim(),
    time: now,
    source,
    enabled: explicitEnabled == null ? source !== 'extracted' : explicitEnabled,
    priority: 'normal',
    category: null,
    confidence: getDefaultMemoryConfidence(source, explicitEnabled == null ? source !== 'extracted' : explicitEnabled),
    entity: null,
    entityType: null,
    expiresAt: null,
    extractionCount: source === 'extracted' ? 1 : 0,
    lastConfirmedAt: source === 'extracted' ? null : now,
    recallCount: 0,
    lastRecalledAt: null
  }

  if (extra && typeof extra === 'object') {
    if (extra.priority && PRIORITY_ORDER[extra.priority] != null) memory.priority = extra.priority
    if (extra.category && CATEGORY_LABELS[extra.category]) memory.category = extra.category
    if (typeof extra.enabled === 'boolean') memory.enabled = extra.enabled
    if (isValidMemoryConfidence(extra.confidence)) memory.confidence = extra.confidence
    const entity = normalizeMemoryEntity(extra.entity)
    if (entity) memory.entity = entity
    if (isValidMemoryEntityType(extra.entityType)) memory.entityType = extra.entityType
  }

  if (source === 'extracted') {
    memory.confidence = upgradeMemoryConfidenceByExtractionCount(memory.confidence, memory.extractionCount)
    if (shouldAutoEnableMemoryByConfidence(memory.confidence)) {
      memory.enabled = true
      memory.lastConfirmedAt = now
      memory.expiresAt = null
    } else if (memory.confidence === 'low') {
      memory.expiresAt = getLowConfidenceMemoryExpiry(now)
    }
  } else {
    memory.expiresAt = null
    memory.lastConfirmedAt = now
  }

  contact.memory.core.push(memory)
  return memory
}

// 更新核心记忆
export function updateCoreMemory(contact, memoryId, updates) {
  const mem = contact?.memory?.core?.find(m => m.id === memoryId)
  if (mem) {
    const now = Date.now()
    Object.assign(mem, updates, { time: now })
    if (mem.source === 'extracted' && (
      (Object.prototype.hasOwnProperty.call(updates || {}, 'enabled') && updates.enabled === true) ||
      Object.prototype.hasOwnProperty.call(updates || {}, 'content')
    )) {
      confirmCoreMemory(mem, { now, source: 'promoted' })
    } else if (!isValidMemoryConfidence(mem.confidence)) {
      mem.confidence = getDefaultMemoryConfidence(mem.source, mem.enabled)
    }

    if (isValidMemoryConfidence(mem.confidence) && mem.confidence !== 'low') {
      mem.expiresAt = null
    }

    mem.entity = normalizeMemoryEntity(mem.entity)
    if (!isValidMemoryEntityType(mem.entityType)) mem.entityType = null
  }
  return mem
}

// 删除核心记忆
export function deleteCoreMemory(contact, memoryId) {
  if (!contact?.memory?.core) return
  contact.memory.core = contact.memory.core.filter(m => m.id !== memoryId)
}
