import { beforeEach, describe, expect, it, vi } from 'vitest'

const { parseMessageContentMock } = vi.hoisted(() => ({
  parseMessageContentMock: vi.fn((text) => [{ type: 'text', content: String(text || '') }])
}))

vi.mock('./messageParser/contentParts', () => ({
  parseMessageContent: parseMessageContentMock
}))

import { useChatSearch } from './useChatSearch'

function createSearchComposable(msgs) {
  return useChatSearch({
    store: {
      activeChat: {
        id: 'chat-1',
        msgs
      }
    },
    messageWindowLimit: { value: 100 },
    messageListRef: { value: null }
  })
}

function createJumpContainer(nodes) {
  const container = {
    clientHeight: 400,
    scrollTop: 0,
    scrollTo: vi.fn(({ top }) => {
      container.scrollTop = top
    }),
    getBoundingClientRect: () => ({ top: 0, height: 400 }),
    querySelectorAll: vi.fn(() => nodes)
  }
  return container
}

function createJumpNode(msgId, msgPart, top = 0, height = 40) {
  return {
    dataset: {
      msgId: String(msgId),
      msgPart: String(msgPart)
    },
    classList: {
      add: vi.fn(),
      remove: vi.fn()
    },
    getBoundingClientRect: () => ({ top, height })
  }
}

describe('useChatSearch', () => {
  beforeEach(() => {
    parseMessageContentMock.mockClear()
    vi.useRealTimers()
  })

  it('returns all matching bubbles without the legacy result cap', () => {
    const msgs = Array.from({ length: 80 }, (_, index) => ({
      id: `m${index}`,
      role: index % 2 === 0 ? 'assistant' : 'user',
      content: `hello world ${index}`
    }))

    const { performSearch, searchResults } = createSearchComposable(msgs)
    performSearch('hello')

    expect(searchResults.value).toHaveLength(80)
    expect(searchResults.value[0].msgId).toBe('m79')
    expect(searchResults.value.at(-1)?.msgId).toBe('m0')
  })

  it('reuses cached parsed search documents across repeated queries', () => {
    const msgs = [
      { id: 'm1', role: 'assistant', content: 'alpha beta gamma' },
      { id: 'm2', role: 'user', content: 'alpha beta delta' }
    ]

    const { performSearch, searchResults } = createSearchComposable(msgs)

    performSearch('alpha')
    expect(searchResults.value).toHaveLength(2)
    expect(parseMessageContentMock).toHaveBeenCalledTimes(2)

    performSearch('alph')
    expect(searchResults.value).toHaveLength(2)
    expect(parseMessageContentMock).toHaveBeenCalledTimes(2)

    performSearch('delta')
    expect(searchResults.value).toHaveLength(1)
    expect(parseMessageContentMock).toHaveBeenCalledTimes(2)
  })

  it('narrows matches from the previous result set when query extends forward', () => {
    const msgs = [
      { id: 'm1', role: 'assistant', content: 'alpha beta gamma' },
      { id: 'm2', role: 'user', content: 'alpha delta' },
      { id: 'm3', role: 'assistant', content: 'beta only' }
    ]

    const { performSearch, searchResults } = createSearchComposable(msgs)

    performSearch('alpha')
    expect(searchResults.value).toHaveLength(2)
    expect(parseMessageContentMock).toHaveBeenCalledTimes(3)

    performSearch('alpha d')
    expect(searchResults.value).toHaveLength(1)
    expect(searchResults.value[0].msgId).toBe('m2')
    expect(parseMessageContentMock).toHaveBeenCalledTimes(3)
  })

  it('jumps to messages with legacy numeric ids', async () => {
    vi.useFakeTimers()

    const targetNode = createJumpNode(42, '0', 600)
    const container = createJumpContainer([targetNode])
    const messageWindowLimit = { value: 1 }
    const { jumpToMessage } = useChatSearch({
      store: {
        activeChat: {
          id: 'chat-1',
          msgs: [
            { id: 42, role: 'assistant', content: 'old message' },
            { id: 43, role: 'user', content: 'new message' }
          ]
        }
      },
      messageWindowLimit,
      messageListRef: { value: { containerRef: container } }
    })

    await expect(jumpToMessage('42', '0')).resolves.toBe(true)

    expect(messageWindowLimit.value).toBe(22)
    expect(container.scrollTo).toHaveBeenCalledWith({ top: 420, behavior: 'smooth' })
    expect(targetNode.classList.add).toHaveBeenCalledWith('search-highlight-flash')

    vi.advanceTimersByTime(2000)
    expect(targetNode.classList.remove).toHaveBeenCalledWith('search-highlight-flash')
  })

  it('falls back to the first block for the same message when the part is missing', async () => {
    vi.useFakeTimers()

    const fallbackNode = createJumpNode('m1', '0', 240)
    const container = createJumpContainer([fallbackNode])
    const { jumpToMessage } = useChatSearch({
      store: {
        activeChat: {
          id: 'chat-1',
          msgs: [{ id: 'm1', role: 'assistant', content: 'hello' }]
        }
      },
      messageWindowLimit: { value: 100 },
      messageListRef: { value: { containerRef: container } }
    })

    await expect(jumpToMessage('m1', 'message')).resolves.toBe(true)

    expect(container.scrollTo).toHaveBeenCalledWith({ top: 60, behavior: 'smooth' })
    expect(fallbackNode.classList.add).toHaveBeenCalledWith('search-highlight-flash')

    vi.advanceTimersByTime(2000)
    expect(fallbackNode.classList.remove).toHaveBeenCalledWith('search-highlight-flash')
  })
})
