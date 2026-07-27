import { beforeEach, describe, expect, it, vi } from 'vitest'

const buildProviderChatPayloadMock = vi.fn()
const fetchProviderChatMock = vi.fn()
const readProviderChatErrorMock = vi.fn()
const consumeProviderChatStreamMock = vi.fn()
const summarizeProviderRequestPayloadMock = vi.fn((payload) => payload?.body || payload || {})
const estimatePromptBreakdownFromMessagesMock = vi.fn(() => ({}))
const estimateUsageFromMessagesMock = vi.fn(() => ({}))
const recordUsageMock = vi.fn()
const createAssistantMessageMock = vi.fn()
const appendAssistantReasoningMock = vi.fn()
const setAssistantReasoningMock = vi.fn()
const executeToolCallsMock = vi.fn()
const addDebugLogMock = vi.fn()

vi.mock('./providerRequest', () => ({
  buildProviderChatPayload: (...args) => buildProviderChatPayloadMock(...args),
  fetchProviderChat: (...args) => fetchProviderChatMock(...args),
  readProviderChatError: (...args) => readProviderChatErrorMock(...args),
  consumeProviderChatStream: (...args) => consumeProviderChatStreamMock(...args),
  summarizeProviderRequestPayload: (...args) => summarizeProviderRequestPayloadMock(...args)
}))

vi.mock('./usage', () => ({
  estimatePromptBreakdownFromMessages: (...args) => estimatePromptBreakdownFromMessagesMock(...args),
  estimateUsageFromMessages: (...args) => estimateUsageFromMessagesMock(...args),
  recordUsage: (...args) => recordUsageMock(...args)
}))

vi.mock('./assistantMessageLifecycle', () => ({
  appendAssistantReasoning: (...args) => appendAssistantReasoningMock(...args),
  createAssistantMessage: (...args) => createAssistantMessageMock(...args),
  setAssistantReasoning: (...args) => setAssistantReasoningMock(...args)
}))

vi.mock('./tools/toolCallExecutor', () => ({
  executeToolCalls: (...args) => executeToolCallsMock(...args)
}))

vi.mock('../useDebugLog', () => ({
  addDebugLog: (...args) => addDebugLogMock(...args)
}))

import { executeToolAwareStreamedRequest } from './toolAwareStreamingRequest'

describe('toolAwareStreamingRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    buildProviderChatPayloadMock.mockImplementation((cfg, messages, options = {}) => ({
      model: cfg.model,
      messages,
      stream: true,
      ...options
    }))
    fetchProviderChatMock.mockResolvedValue({
      request: { targetUrl: 'https://api.test/chat/completions' },
      response: { ok: true }
    })
    createAssistantMessageMock.mockImplementation((_makeMsgId, traceId, extra = {}) => ({
      id: 'msg_assistant_1',
      role: 'assistant',
      content: '',
      traceId,
      ...extra
    }))
    appendAssistantReasoningMock.mockImplementation((message, content, round = 1) => {
      const text = String(content || '').trim()
      if (!text) return false
      const logs = [...(message.reasoningLogs || [])]
      if (logs.some(item => item.round === round && item.content === text)) return false
      message.reasoningLogs = [...logs, { content: text, round }]
      message.reasoningContent = message.reasoningLogs.map(item => item.content).join('\n\n')
      return true
    })
    setAssistantReasoningMock.mockImplementation((message, content, round = 1) => {
      const text = String(content || '').trim()
      if (!text) return false
      const logs = [...(message.reasoningLogs || [])]
      const index = logs.findIndex(item => item.round === round)
      if (index >= 0 && logs[index].content === text) return false
      const entry = { content: text, round }
      if (index >= 0) logs.splice(index, 1, entry)
      else logs.push(entry)
      message.reasoningLogs = logs
      message.reasoningContent = logs.map(item => item.content).join('\n\n')
      return true
    })
    executeToolCallsMock.mockResolvedValue({
      messages: [
        { role: 'tool', tool_call_id: 'call_1', content: '{"success":true,"result":{"diaryId":"diary_1"}}' }
      ],
      logs: []
    })
    consumeProviderChatStreamMock
      .mockImplementationOnce(async (_cfg, _res, _onDelta, options) => {
        expect(options).toEqual(expect.objectContaining({
          toolAware: true,
          onReasoningDelta: expect.any(Function)
        }))
        options.onReasoningDelta('private')
        options.onReasoningDelta('private trace')
        return {
        emittedChars: 0,
        emittedEvents: 0,
        usedFallback: false,
        usage: null,
        finishReason: 'tool_calls',
        filteredReasoningChars: 12,
        reasoningContent: 'private trace',
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'write_diary',
              arguments: '{"content":"今天过得很充实"}'
            }
          }
        ]
        }
      })
      .mockResolvedValueOnce({
        emittedChars: 2,
        emittedEvents: 1,
        usedFallback: false,
        usage: null,
        finishReason: 'stop',
        filteredReasoningChars: 0,
        reasoningContent: '',
        toolCalls: []
      })
  })

  it('passes reasoning_content back on tool follow-up rounds', async () => {
    const activeChat = { msgs: [] }
    const streamBatcher = {
      push: vi.fn(),
      flushNow: vi.fn()
    }

    await executeToolAwareStreamedRequest({
      cfg: {
        url: 'https://api.test',
        key: 'secret',
        model: 'test-model'
      },
      messages: [{ role: 'user', content: 'hi' }],
      activeChat,
      makeMsgId: () => 'msg_1',
      traceId: 'trace_1',
      onChunk: vi.fn(),
      createStreamChunkBatcher: () => streamBatcher,
      tools: [
        {
          type: 'function',
          function: {
            name: 'write_diary',
            parameters: { type: 'object', properties: {} }
          }
        }
      ],
      toolContext: {}
    })

    expect(buildProviderChatPayloadMock).toHaveBeenCalledTimes(2)
    expect(activeChat.msgs[0]).toMatchObject({
      reasoningContent: 'private trace',
      reasoningLogs: [{ content: 'private trace', round: 1 }],
      reasoningStreaming: false
    })
    expect(activeChat.msgs[0]).not.toHaveProperty('reasoningStreamingRound')
    const secondRoundMessages = buildProviderChatPayloadMock.mock.calls[1][1]
    expect(secondRoundMessages).toEqual([
      { role: 'user', content: 'hi' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'write_diary',
              arguments: '{"content":"今天过得很充实"}'
            }
          }
        ],
        reasoning_content: 'private trace'
      },
      { role: 'tool', tool_call_id: 'call_1', content: '{"success":true,"result":{"diaryId":"diary_1"}}' }
    ])
  })

  it('keeps provider-native tool calling enabled for Anthropic configs', async () => {
    const activeChat = { msgs: [] }
    consumeProviderChatStreamMock.mockReset()
    consumeProviderChatStreamMock.mockResolvedValueOnce({
      emittedChars: 1,
      emittedEvents: 1,
      finishReason: 'stop',
      toolCalls: []
    })

    await executeToolAwareStreamedRequest({
      cfg: {
        url: 'https://api.anthropic.com',
        key: 'secret',
        model: 'claude-sonnet',
        apiFormat: 'anthropic-messages'
      },
      messages: [{ role: 'user', content: 'hi' }],
      activeChat,
      makeMsgId: () => 'msg_1',
      traceId: 'trace_1',
      onChunk: vi.fn(),
      createStreamChunkBatcher: () => ({ push: vi.fn(), flushNow: vi.fn() }),
      tools: [
        {
          type: 'function',
          function: {
            name: 'write_diary',
            parameters: { type: 'object', properties: {} }
          }
        }
      ],
      toolContext: {}
    })

    expect(buildProviderChatPayloadMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiFormat: 'anthropic-messages' }),
      [{ role: 'user', content: 'hi' }],
      expect.objectContaining({
        tools: expect.arrayContaining([
          expect.objectContaining({ function: expect.objectContaining({ name: 'write_diary' }) })
        ])
      })
    )
  })
})
