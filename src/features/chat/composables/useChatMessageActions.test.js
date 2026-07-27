import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed } from 'vue'
import { useChatMessageActions } from './useChatMessageActions'

const { playEvent } = vi.hoisted(() => ({
  playEvent: vi.fn()
}))

vi.mock('../../../composables/useSoundEffects', () => ({
  useSoundEffects: () => ({
    playEvent
  })
}))

function createHarness(options = {}) {
  let idSeq = 0
  const showToast = vi.fn()
  const callAPI = vi.fn(options.callAPI || (async () => ({ success: true })))
  const callGroupAPI = vi.fn(options.callGroupAPI || (async () => ({ success: true })))
  const store = {
    activeChat: {
      id: 'chat_1',
      name: 'Alice',
      msgs: [],
      groupMode: 'single'
    },
    pendingImages: [],
    replyingToId: null,
    replyingToText: null,
    editingMsgId: null,
    selectedMemberId: options.selectedMemberId || '',
    ui: {
      isTyping: false,
      isThinking: true,
      animateMsgId: null
    }
  }

  const api = useChatMessageActions({
    albumStore: { addPhoto: vi.fn() },
    callAPI,
    callGroupAPI,
    checkAssistantCallInvite: vi.fn(async () => {}),
    cleanupOfflineLinksForRemovedMessages: vi.fn(),
    closePlusMenu: vi.fn(),
    contextMenuContent: computed(() => ''),
    contextMenuMsgId: computed(() => null),
    contextMenuPartIndex: computed(() => null),
    hideContextMenu: vi.fn(),
    invalidateRoundVectors: vi.fn(),
    isGroupChat: computed(() => options.isGroupChat === true),
    makeId: (prefix) => `${prefix}_${++idSeq}`,
    onAcceptedMeet: vi.fn(),
    onAssistantReplied: vi.fn(async () => null),
    onMessageSent: vi.fn(async () => null),
    parseMessageContent: vi.fn(() => []),
    processAssistantFavoriteTokens: vi.fn(async () => {}),
    processAssistantPlannerActions: vi.fn(async () => {}),
    processAssistantImageTokens: vi.fn(async () => {}),
    rerollImageMessage: vi.fn(async () => false),
    rebuildMessageContent: vi.fn(() => ''),
    scheduleSave: vi.fn(),
    scrollToBottom: vi.fn(),
    showConfirm: vi.fn(async () => true),
    showToast,
    store
  })

  return {
    api,
    callAPI,
    callGroupAPI,
    showToast,
    store
  }
}

describe('useChatMessageActions', () => {
  beforeEach(() => {
    playEvent.mockReset()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows typing immediately but defers empty-send assistant requests to the next paint', async () => {
    const { api, callAPI, store } = createHarness()

    const pending = api.sendMessage()

    expect(store.ui.isTyping).toBe(true)
    expect(store.ui.isThinking).toBe(false)
    expect(callAPI).not.toHaveBeenCalled()

    await vi.runOnlyPendingTimersAsync()
    await pending

    expect(callAPI).toHaveBeenCalledTimes(1)
  })

  it('saveEdit trims and saves whole-message edits, then clears edit state', () => {
    const { api, store } = createHarness()
    store.activeChat.msgs.push({ id: 'msg_a', role: 'assistant', content: 'old', time: 1 })
    store.editingMsgId = 'msg_a'

    api.saveEdit('  new text  ')

    expect(store.activeChat.msgs[0].content).toBe('new text')
    expect(store.editingMsgId).toBe(null)
    expect(api.editDraft.value).toBe('')
  })

  it('saveEdit ignores empty text and keeps edit state', () => {
    const { api, store } = createHarness()
    store.activeChat.msgs.push({ id: 'msg_a', role: 'assistant', content: 'old', time: 1 })
    store.editingMsgId = 'msg_a'

    api.saveEdit('   ')

    expect(store.activeChat.msgs[0].content).toBe('old')
    expect(store.editingMsgId).toBe('msg_a')
  })

  it('handleEdit does not clobber the main input draft', () => {
    const { api } = createHarness()
    api.inputText.value = '正在输入的草稿'

    api.handleEdit()

    expect(api.inputText.value).toBe('正在输入的草稿')
  })

  it('clears optimistic typing when the assistant request fails early', async () => {
    const { api, callAPI, showToast, store } = createHarness({
      callAPI: async () => ({ success: false, error: '请求失败' })
    })

    const pending = api.sendMessage()

    expect(store.ui.isTyping).toBe(true)
    expect(callAPI).not.toHaveBeenCalled()

    await vi.runOnlyPendingTimersAsync()
    await pending

    expect(callAPI).toHaveBeenCalledTimes(1)
    expect(store.ui.isTyping).toBe(false)
    expect(store.ui.isThinking).toBe(false)
    expect(showToast).toHaveBeenCalledWith('请求失败')
  })
})
