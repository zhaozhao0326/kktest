import { describe, expect, it } from 'vitest'
import { buildMemoryPrompt } from './injection'
import { initContactMemory } from './shared'

function createStore() {
  return {
    getPersonaForContact() {
      return { name: '阿青' }
    }
  }
}

function createCoreMemory(id, content, extra = {}) {
  return {
    id,
    content,
    time: Date.now(),
    source: 'manual',
    enabled: true,
    priority: 'normal',
    category: null,
    confidence: 'high',
    entity: null,
    entityType: null,
    expiresAt: null,
    extractionCount: 0,
    lastConfirmedAt: Date.now(),
    recallCount: 0,
    lastRecalledAt: null,
    ...extra
  }
}

describe('memory injection', () => {
  it('keeps relationship baseline and injects only topic-relevant memories', () => {
    const contact = {
      id: 'c1',
      name: '小猫',
      msgs: [
        { id: 'm1', role: 'user', content: '我昨晚又失眠了，白噪音还是最有用。', time: Date.now() - 2000 },
        { id: 'm2', role: 'assistant', content: '那我今晚继续陪你聊到困。', time: Date.now() - 1000 }
      ],
      memory: {
        core: [
          createCoreMemory('mem_rel', '{{char}}和{{user}}已经默认互相熟悉，可以直接延续亲密口吻。', {
            category: 'relationship',
            priority: 'high'
          }),
          createCoreMemory('mem_noise', '{{user}}睡不着时喜欢听白噪音。', {
            category: 'preference'
          }),
          createCoreMemory('mem_garden', '{{user}}周末喜欢去植物园散步。', {
            category: 'routine'
          })
        ],
        shortTerm: [],
        longTerm: []
      },
      memorySettings: {
        enabled: true,
        maxInjectTokens: 600
      }
    }

    initContactMemory(contact)
    const prompt = buildMemoryPrompt(contact, { store: createStore() })

    expect(prompt).toContain('[关系与稳定设定]')
    expect(prompt).toContain('已经默认互相熟悉')
    expect(prompt).toContain('白噪音')
    expect(prompt).not.toContain('植物园')
    expect(contact.memory.core.find(item => item.id === 'mem_rel')?.recallCount).toBe(1)
    expect(contact.memory.core.find(item => item.id === 'mem_noise')?.recallCount).toBe(1)
    expect(contact.memory.core.find(item => item.id === 'mem_garden')?.recallCount).toBe(0)
  })

  it('boosts memories whose entity appears in the latest conversation', () => {
    const contact = {
      id: 'c2',
      name: '小猫',
      msgs: [
        { id: 'm1', role: 'user', content: '小明这两天又来找我聊天了。', time: Date.now() - 1000 }
      ],
      memory: {
        core: [
          createCoreMemory('mem_xm', '{{user}}的大学同学小明在北京工作。', {
            category: 'people',
            entity: '小明',
            entityType: 'person'
          }),
          createCoreMemory('mem_book', '{{user}}最近在看园艺书。', {
            category: 'fact'
          })
        ],
        shortTerm: [],
        longTerm: []
      },
      memorySettings: {
        enabled: true,
        maxInjectTokens: 400
      }
    }

    initContactMemory(contact)
    const prompt = buildMemoryPrompt(contact, { store: createStore() })

    expect(prompt).toContain('小明在北京工作')
    expect(prompt).not.toContain('园艺书')
  })
})
