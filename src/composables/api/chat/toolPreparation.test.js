import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  getEffectiveToolCallingMode,
  getLastUserMessageContent,
  prepareChatTools
} from './toolPreparation'

describe('toolPreparation', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('resolves the effective mode from the legacy switch and mode setting', () => {
    expect(getEffectiveToolCallingMode({ allowToolCalling: false, toolCallingMode: 'always' })).toBe('off')
    expect(getEffectiveToolCallingMode({ allowToolCalling: true })).toBe('intent')
    expect(getEffectiveToolCallingMode({ allowToolCalling: true, toolCallingMode: 'always' })).toBe('always')
  })

  it('extracts the last user message text from string or content parts', () => {
    expect(getLastUserMessageContent({
      msgs: [
        { role: 'user', content: '旧消息' },
        { role: 'assistant', content: '回复' },
        {
          role: 'user',
          content: [
            { type: 'text', text: '记住' },
            { type: 'image_url', image_url: {} },
            { type: 'text', text: '这件事' }
          ]
        }
      ]
    })).toBe('记住 这件事')
  })

  it('returns no tools in intent mode for ordinary chat', async () => {
    const discoverMcpTools = vi.fn().mockResolvedValue({ tools: [], externalExecutors: new Map() })

    const result = await prepareChatTools({
      contactsStore: {},
      settingsStore: { allowToolCalling: true, toolCallingMode: 'intent' },
      activeChat: { id: 'chat_1', msgs: [{ role: 'user', content: '你好呀' }] },
      selectedMcpServerIds: [],
      discoverMcpTools,
      makeMsgId: () => 'msg_1'
    })

    expect(result.tools).toBeNull()
    expect(result.toolContext).toBeNull()
    expect(discoverMcpTools).toHaveBeenCalledWith({ serverIds: [] })
  })

  it('selects only the matching tool in intent mode', async () => {
    const result = await prepareChatTools({
      contactsStore: {},
      settingsStore: { allowToolCalling: true, toolCallingMode: 'intent' },
      activeChat: { id: 'chat_1', msgs: [{ role: 'user', content: '请记住我喜欢乌龙茶' }] },
      selectedMcpServerIds: [],
      discoverMcpTools: vi.fn().mockResolvedValue({ tools: [], externalExecutors: new Map() }),
      makeMsgId: () => 'msg_1'
    })

    expect(result.tools.map((tool) => tool.function.name)).toEqual(['add_memory'])
    expect(result.toolContext?.activeChat?.id).toBe('chat_1')
  })

  it('keeps all available tools in always mode', async () => {
    const result = await prepareChatTools({
      contactsStore: {},
      settingsStore: { allowToolCalling: true, toolCallingMode: 'always' },
      activeChat: { id: 'chat_1', msgs: [{ role: 'user', content: '你好呀' }] },
      selectedMcpServerIds: ['docs'],
      discoverMcpTools: vi.fn().mockResolvedValue({
        tools: [{ name: 'mcp_docs_search', description: 'Search docs', parameters: { type: 'object', properties: {} } }],
        externalExecutors: new Map()
      }),
      makeMsgId: () => 'msg_1'
    })

    expect(result.tools.map((tool) => tool.function.name)).toEqual(['add_memory', 'mcp_docs_search'])
  })
})
