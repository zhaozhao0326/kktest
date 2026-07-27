import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useContactsStore } from '../../../stores/contacts'
import { useConfigsStore } from '../../../stores/configs'
import { useLorebookStore } from '../../../stores/lorebook'
import { useOfflineStore } from '../../../stores/offline'
import { usePersonasStore } from '../../../stores/personas'
import { useOfflineApi } from './useOfflineApi'

const mocks = vi.hoisted(() => ({
  runOpenAICompatTextStream: vi.fn()
}))

vi.mock('../../../composables/api/openaiCompatTextStream', () => mocks)

function seedOfflineStores() {
  const contactsStore = useContactsStore()
  const configsStore = useConfigsStore()
  const lorebookStore = useLorebookStore()
  const offlineStore = useOfflineStore()
  const personasStore = usePersonasStore()

  const contact = {
    id: 'contact_1',
    name: '洛',
    prompt: '你是{{char}}。',
    configId: 'cfg_1',
    personaId: 'persona_1',
    msgs: [
      { id: 'm1', role: 'user', content: '聊到了城市传说' }
    ],
    offlineMsgs: [],
    boundLorebooks: ['book_1']
  }

  contactsStore.contacts = [contact]
  configsStore.configs = [
    { id: 'cfg_1', key: 'test-key', url: 'https://example.test/v1', model: 'test-model' }
  ]
  configsStore.activeConfigId = 'cfg_1'
  personasStore.personas = [
    { id: 'persona_1', name: '蝶', description: '用户喜欢夜间散步。' }
  ]
  lorebookStore.lorebook.books = [
    {
      id: 'book_1',
      name: '城市设定',
      entries: [
        {
          id: 'entry_1',
          name: '雨巷',
          enabled: true,
          alwaysActive: true,
          content: '雨巷里有只在深夜营业的书店。',
          insertDepth: 0,
          order: 0
        }
      ]
    }
  ]

  offlineStore.createPreset({
    id: 'preset_1',
    name: 'ST 预设',
    systemPrompt: '预设系统：称呼用户为{{user}}。',
    promptEntries: [
      {
        id: 'preset_entry_1',
        name: '预设条目',
        role: 'system',
        content: '预设条目：保持{{char}}的语气。',
        enabled: true,
        injectionDepth: 0,
        injectionPosition: 'in_chat',
        order: 0
      }
    ]
  })
  offlineStore.setActivePreset('preset_1')

  return { contact }
}

function getLastRequestBody() {
  return mocks.runOpenAICompatTextStream.mock.calls.at(-1)?.[0]?.body
}

describe('useOfflineApi', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mocks.runOpenAICompatTextStream.mockReset()
    mocks.runOpenAICompatTextStream.mockResolvedValue({
      text: '线下回复',
      streamResult: { finishReason: 'stop' }
    })
  })

  it('keeps character, user persona and lorebook prompts when an offline preset is active', async () => {
    seedOfflineStores()
    const api = useOfflineApi()

    const result = await api.sendMessage('contact_1', '我们到了吗？')

    expect(result.success).toBe(true)
    const body = getLastRequestBody()
    const promptText = body.messages.map(message => message.content).join('\n\n')
    expect(promptText).toContain('你是洛。')
    expect(promptText).toContain('用户面具')
    expect(promptText).toContain('名称：蝶')
    expect(promptText).toContain('用户喜欢夜间散步。')
    expect(promptText).toContain('<world_book name="雨巷">')
    expect(promptText).toContain('雨巷里有只在深夜营业的书店。')
    expect(promptText).toContain('预设系统：称呼用户为蝶。')
    expect(promptText).toContain('预设条目：保持洛的语气。')
  })

  it('keeps independent context for generated offline openings with an active preset', async () => {
    seedOfflineStores()
    const api = useOfflineApi()

    const result = await api.generateOpening('contact_1')

    expect(result.success).toBe(true)
    const body = getLastRequestBody()
    const promptText = body.messages.map(message => message.content).join('\n\n')
    expect(promptText).toContain('你是洛。')
    expect(promptText).toContain('用户面具')
    expect(promptText).toContain('<world_book name="雨巷">')
    expect(promptText).toContain('预设系统：称呼用户为蝶。')
    expect(promptText).toContain('请直接开始线下见面的第一幕')
  })
})
