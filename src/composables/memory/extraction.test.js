import { describe, expect, it, vi } from 'vitest'
import { extractMemoriesWithAI } from './extraction'

function createDeps(callSummaryAPI) {
  return {
    aiExtractInFlight: new Map(),
    aiExtractLastAttemptAt: new Map(),
    callSummaryAPI
  }
}

function createBaseContact() {
  return {
    id: 'c1',
    name: '小猫',
    msgs: [],
    memory: {
      core: [],
      shortTerm: [],
      longTerm: [],
      lastAIMemoryMsgId: null
    },
    memorySettings: {
      enabled: true,
      aiAutoMemory: true,
      aiAutoMemoryTriggerRounds: 0,
      aiAutoMemoryTriggerTokens: 0,
      aiAutoMemoryMinNewMessages: 1
    }
  }
}

describe('memory extraction lifecycle', () => {
  it('stores low-confidence candidates with expiry and entity metadata', async () => {
    const contact = createBaseContact()
    contact.msgs = [
      { id: 'm1', role: 'user', content: '我有一只叫团子的橘猫，今年三岁了。', time: Date.now() - 1000 }
    ]

    const callSummaryAPI = vi.fn().mockResolvedValue({
      success: true,
      content: JSON.stringify([{
        content: '{{user}}的猫叫团子，今年三岁。',
        priority: 'normal',
        category: 'people',
        confidence: 'low',
        entity: '团子',
        entityType: 'pet'
      }])
    })

    const result = await extractMemoriesWithAI(contact, createDeps(callSummaryAPI))

    expect(result.added).toHaveLength(1)
    const memory = contact.memory.core[0]
    expect(memory.confidence).toBe('low')
    expect(memory.enabled).toBe(false)
    expect(typeof memory.expiresAt).toBe('number')
    expect(memory.expiresAt).toBeGreaterThan(Date.now())
    expect(memory.entity).toBe('团子')
    expect(memory.entityType).toBe('pet')
  })

  it('promotes repeated medium-confidence extractions to high-confidence enabled memories', async () => {
    const contact = createBaseContact()
    const firstCall = vi.fn().mockResolvedValue({
      success: true,
      content: JSON.stringify([{
        content: '{{user}}睡不着时喜欢听白噪音。',
        priority: 'normal',
        category: 'preference',
        confidence: 'medium'
      }])
    })

    contact.msgs = [
      { id: 'm1', role: 'user', content: '我睡不着的时候喜欢听白噪音，比较容易放松。', time: Date.now() - 2000 }
    ]

    await extractMemoriesWithAI(contact, createDeps(firstCall))

    const secondCall = vi.fn().mockResolvedValue({
      success: true,
      content: JSON.stringify([{
        content: '{{user}}睡不着时喜欢听白噪音。',
        priority: 'normal',
        category: 'preference',
        confidence: 'medium'
      }])
    })

    contact.msgs.push({
      id: 'm2',
      role: 'user',
      content: '还是老样子，晚上听白噪音最容易睡着。',
      time: Date.now() - 1000
    })

    const result = await extractMemoriesWithAI(contact, createDeps(secondCall))

    expect(result.updated).toHaveLength(1)
    expect(contact.memory.core).toHaveLength(1)
    const memory = contact.memory.core[0]
    expect(memory.extractionCount).toBe(2)
    expect(memory.confidence).toBe('high')
    expect(memory.enabled).toBe(true)
    expect(memory.expiresAt).toBe(null)
  })
})
