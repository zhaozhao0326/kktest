import { getCurrentInstance, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { parseMessageContent } from './messageParser/contentParts'
import { formatBeijingLocale } from '../../../utils/beijingTime'
import {
  MESSAGE_CONTENT_PART_PARSE_OPTIONS,
  buildMessagePartSearchText
} from '../../../utils/messageContentParts'
import { favoritePartIndexToKey } from '../../../utils/messageFavorites'
import { normalizeSearchText } from '../../../utils/searchText'

const HIGHLIGHT_DURATION_MS = 2000
const SEARCH_WARMUP_TIMEOUT_MS = 800
const JUMP_DOM_RETRY_COUNT = 8

const MESSAGE_SEARCH_DOC_CACHE = new WeakMap()

function getTextFingerprint(text) {
  const normalized = String(text ?? '')
  if (!normalized) return '0:'
  const head = normalized.slice(0, 32)
  const tail = normalized.slice(-32)
  return `${normalized.length}:${head}:${tail}`
}

function getTranscriptFingerprint(transcript) {
  if (!Array.isArray(transcript) || transcript.length === 0) return '0:'
  const joined = transcript
    .map(item => item?.text || item?.content || '')
    .filter(Boolean)
    .join(' ')
  return getTextFingerprint(joined)
}


function buildSearchSnippet(searchText, matchIndex, queryLength) {
  const start = Math.max(0, matchIndex - 20)
  const end = Math.min(searchText.length, matchIndex + queryLength + 20)
  let snippet = ''
  if (start > 0) snippet += '...'
  snippet += searchText.slice(start, end)
  if (end < searchText.length) snippet += '...'
  return snippet
}

function buildMessageSearchFingerprint(message) {
  const displayContent = message?.displayContent ?? message?.content ?? ''
  return [
    message?.isSticker ? '1' : '0',
    message?.isCallRecord ? '1' : '0',
    message?.isImage ? '1' : '0',
    message?.isMockImage ? '1' : '0',
    message?.isImageRendering ? '1' : '0',
    getTextFingerprint(displayContent),
    getTextFingerprint(message?.stickerName || ''),
    getTranscriptFingerprint(message?.callTranscript)
  ].join('|')
}

function createSearchDocument(message, partKey, content) {
  const normalizedContent = normalizeSearchText(content)
  if (!normalizedContent) return null

  return {
    key: `${message.id}:${partKey}`,
    msgId: message.id,
    partKey,
    content: normalizedContent,
    contentLower: normalizedContent.toLowerCase(),
    role: message.role,
    time: message.time,
    timeText: message.time
      ? formatBeijingLocale(new Date(message.time), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : ''
  }
}

function buildMessageSearchDocuments(message) {
  if (!message || typeof message !== 'object') return []

  if (message.isSticker && message.stickerName) {
    const doc = createSearchDocument(message, favoritePartIndexToKey(null), `表情包 ${message.stickerName}`)
    return doc ? [doc] : []
  }

  if (message.isCallRecord) {
    const transcript = Array.isArray(message.callTranscript)
      ? message.callTranscript.map(item => item?.text || item?.content || '').join(' ')
      : ''
    const detail = transcript || message.content || message.displayContent || '通话记录'
    const doc = createSearchDocument(message, favoritePartIndexToKey(null), detail)
    return doc ? [doc] : []
  }

  if (message.isImage || message.isMockImage || message.isImageRendering) {
    const doc = createSearchDocument(message, favoritePartIndexToKey(null), message.displayContent ?? message.content)
    return doc ? [doc] : []
  }

  const rawContent = String((message.displayContent ?? message.content) ?? '').trim()
  if (!rawContent) return []

  const parts = parseMessageContent(rawContent, MESSAGE_CONTENT_PART_PARSE_OPTIONS)
  const docs = []

  for (let index = 0; index < parts.length; index += 1) {
    const doc = createSearchDocument(message, favoritePartIndexToKey(index), buildMessagePartSearchText(parts[index]))
    if (doc) docs.push(doc)
  }

  if (docs.length > 0) return docs

  const fallbackDoc = createSearchDocument(message, favoritePartIndexToKey(null), rawContent)
  return fallbackDoc ? [fallbackDoc] : []
}

function getCachedMessageSearchDocuments(message) {
  if (!message || typeof message !== 'object') return []

  const fingerprint = buildMessageSearchFingerprint(message)
  const cached = MESSAGE_SEARCH_DOC_CACHE.get(message)
  if (cached?.fingerprint === fingerprint) {
    return cached.documents
  }

  const documents = buildMessageSearchDocuments(message)
  MESSAGE_SEARCH_DOC_CACHE.set(message, {
    fingerprint,
    documents
  })
  return documents
}

function findMessageElement(container, msgId, partKey = '') {
  if (!container || !msgId) return null

  const targetMsgId = String(msgId)
  const targetPartKey = String(partKey || '').trim()
  const nodes = Array.from(container.querySelectorAll('[data-msg-id]'))
  const sameMessageNodes = nodes.filter(node => String(node?.dataset?.msgId || '') === targetMsgId)
  if (sameMessageNodes.length === 0) return null

  if (targetPartKey) {
    const exactNode = sameMessageNodes.find(node => String(node?.dataset?.msgPart || '') === targetPartKey)
    if (exactNode) return exactNode
  }

  return sameMessageNodes[0] || null
}

function scrollElementIntoContainer(container, el) {
  if (!container || !el) return

  const containerRect = container.getBoundingClientRect()
  const targetRect = el.getBoundingClientRect()
  const top = container.scrollTop + targetRect.top - containerRect.top - ((container.clientHeight - targetRect.height) / 2)
  const nextTop = Math.max(0, top)

  if (typeof container.scrollTo === 'function') {
    container.scrollTo({ top: nextTop, behavior: 'smooth' })
    return
  }

  container.scrollTop = nextTop
}

function waitForAnimationFrame() {
  return new Promise(resolve => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve())
      return
    }
    setTimeout(resolve, 16)
  })
}

export function useChatSearch({ store, messageWindowLimit, messageListRef }) {
  const searchVisible = ref(false)
  const searchQuery = ref('')
  const searchResults = ref([])
  const hasComponentInstance = Boolean(getCurrentInstance())

  let lastSearchChatId = ''
  let lastSearchQuery = ''
  let lastMatchedDocuments = []
  let warmupHandle = null

  function resetSearchSession(options = {}) {
    const clearResults = options.clearResults !== false
    lastSearchChatId = ''
    lastSearchQuery = ''
    lastMatchedDocuments = []
    if (clearResults) {
      searchResults.value = []
    }
  }

  function clearWarmup() {
    if (warmupHandle == null) return
    if (typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(warmupHandle)
    } else {
      clearTimeout(warmupHandle)
    }
    warmupHandle = null
  }

  function collectSearchDocuments(msgs) {
    const documents = []
    for (let index = msgs.length - 1; index >= 0; index -= 1) {
      const message = msgs[index]
      if (!message || message.hideInChat || message.hidden) continue
      const cachedDocs = getCachedMessageSearchDocuments(message)
      for (let docIndex = cachedDocs.length - 1; docIndex >= 0; docIndex -= 1) {
        documents.push(cachedDocs[docIndex])
      }
    }
    return documents
  }

  function scheduleSearchWarmup() {
    clearWarmup()
    const msgs = store.activeChat?.msgs
    if (!Array.isArray(msgs) || msgs.length === 0) return

    const runWarmup = () => {
      warmupHandle = null
      void collectSearchDocuments(msgs)
    }

    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      warmupHandle = window.requestIdleCallback(runWarmup, { timeout: SEARCH_WARMUP_TIMEOUT_MS })
      return
    }

    warmupHandle = setTimeout(runWarmup, 60)
  }

  function performSearch(query) {
    searchQuery.value = query
    const normalizedQuery = normalizeSearchText(query)
    if (!normalizedQuery) {
      resetSearchSession()
      return
    }

    const msgs = store.activeChat?.msgs
    if (!Array.isArray(msgs)) {
      resetSearchSession()
      return
    }

    const lowerQuery = normalizedQuery.toLowerCase()
    const chatId = String(store.activeChat?.id || '')
    const canFilterPrevious =
      chatId &&
      chatId === lastSearchChatId &&
      lastSearchQuery &&
      lowerQuery.startsWith(lastSearchQuery)

    const sourceDocuments = canFilterPrevious
      ? lastMatchedDocuments
      : collectSearchDocuments(msgs)

    const matchedDocuments = []
    const nextResults = []

    for (let index = 0; index < sourceDocuments.length; index += 1) {
      const document = sourceDocuments[index]
      const matchIndex = document.contentLower.indexOf(lowerQuery)
      if (matchIndex === -1) continue

      matchedDocuments.push(document)
      nextResults.push({
        key: document.key,
        msgId: document.msgId,
        partKey: document.partKey,
        content: document.content,
        role: document.role,
        time: document.time,
        timeText: document.timeText,
        snippet: buildSearchSnippet(document.content, matchIndex, normalizedQuery.length)
      })
    }

    lastSearchChatId = chatId
    lastSearchQuery = lowerQuery
    lastMatchedDocuments = matchedDocuments
    searchResults.value = nextResults
  }

  async function jumpToMessage(msgId, partKey = '') {
    const msgs = store.activeChat?.msgs
    if (!Array.isArray(msgs)) return false

    const targetMsgId = String(msgId ?? '').trim()
    if (!targetMsgId) return false

    const msgIndex = msgs.findIndex(m => String(m?.id ?? '') === targetMsgId)
    if (msgIndex === -1) return false

    const totalMsgs = msgs.length
    const distFromEnd = totalMsgs - msgIndex
    if (distFromEnd > messageWindowLimit.value) {
      messageWindowLimit.value = distFromEnd + 20
    }

    await nextTick()
    await nextTick()

    const container = messageListRef.value?.containerRef
    if (!container) return false

    const favoritePartKey = String(partKey || '').trim()
    let el = null
    for (let attempt = 0; attempt < JUMP_DOM_RETRY_COUNT; attempt += 1) {
      el = findMessageElement(container, targetMsgId, favoritePartKey)
      if (el) break
      await waitForAnimationFrame()
    }

    if (!el) return false

    scrollElementIntoContainer(container, el)

    el.classList.add('search-highlight-flash')
    setTimeout(() => {
      el.classList.remove('search-highlight-flash')
    }, HIGHLIGHT_DURATION_MS)

    return true
  }

  function openSearch() {
    searchVisible.value = true
    searchQuery.value = ''
    searchResults.value = []
    resetSearchSession({ clearResults: false })
    scheduleSearchWarmup()
  }

  function closeSearch() {
    clearWarmup()
    searchVisible.value = false
    searchQuery.value = ''
    resetSearchSession()
  }

  if (hasComponentInstance) {
    watch(() => store.activeChat?.id, () => {
      clearWarmup()
      resetSearchSession()
      searchQuery.value = ''
      if (searchVisible.value) {
        scheduleSearchWarmup()
      }
    })

    watch(() => store.activeChat?.msgs?.length || 0, () => {
      resetSearchSession({ clearResults: false })
      if (searchVisible.value) {
        scheduleSearchWarmup()
        if (searchQuery.value) {
          performSearch(searchQuery.value)
        }
      }
    })

    onBeforeUnmount(() => {
      clearWarmup()
    })
  }

  return {
    searchVisible,
    searchQuery,
    searchResults,
    performSearch,
    jumpToMessage,
    openSearch,
    closeSearch
  }
}
