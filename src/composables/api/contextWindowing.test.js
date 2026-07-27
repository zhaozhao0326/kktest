import { describe, expect, it } from 'vitest'
import { getContextWindowedMsgs } from './contextWindowing'
import { clearContactMemoryData } from '../memory/shared'
import { buildMemoryPrompt } from '../memory/injection'

describe('getContextWindowedMsgs', () => {
  it('keeps chat context when only memory is cleared', async () => {
    const contact = {
      msgs: [
        { id: 'm1', role: 'user', content: '聊天内容', time: 100 },
        { id: 'm2', role: 'assistant', content: '回复内容', time: 200 }
      ],
      memory: {
        core: [{ id: 'mem1', content: '记忆内容' }],
        contextSummary: { content: '隐藏摘要' }
      },
      memorySettings: {
        enabled: false,
        smartContext: false
      }
    }

    clearContactMemoryData(contact)
    const result = await getContextWindowedMsgs(contact)

    expect(result.retrievedContext).toBeNull()
    expect(result.contextMsgs).toEqual(contact.msgs)
  })

  it('sends no chat context after the user separately clears chat and memory', async () => {
    const contact = {
      msgs: [
        { id: 'm1', role: 'user', content: '旧秘密', time: 100 }
      ],
      memory: {
        core: [{ id: 'mem1', content: '旧秘密' }],
        longTerm: [{ id: 'long1', content: '旧总结' }],
        contextSummary: { content: '隐藏摘要' }
      },
      memorySettings: {
        enabled: true,
        smartContext: true,
        historyRetrievalEnabled: true
      }
    }

    contact.msgs = []
    clearContactMemoryData(contact)
    const result = await getContextWindowedMsgs(contact)

    expect(contact.memory.core).toEqual([])
    expect(contact.memory.longTerm).toEqual([])
    expect(contact.memory.contextSummary).toBeNull()
    expect(buildMemoryPrompt(contact)).toBe('')
    expect(result.contextMsgs).toEqual([])
    expect(result.retrievedContext).toBeNull()
  })

  it('keeps memory available when only chat history is cleared', () => {
    const contact = {
      msgs: [],
      memory: {
        core: [{
          id: 'mem1',
          content: '这条记忆应当保留',
          enabled: true,
          priority: 'high',
          category: 'relationship',
          source: 'manual',
          confidence: 'high',
          time: 100
        }],
        longTerm: [],
        shortTerm: []
      },
      memorySettings: {
        enabled: true,
        maxInjectTokens: 600
      }
    }

    expect(buildMemoryPrompt(contact)).toContain('这条记忆应当保留')
  })
})
