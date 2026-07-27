import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  contactsStore: {
    contacts: [],
    activeChat: null
  },
  settingsStore: {
    voiceTtsMode: 'minimax',
    voiceTtsConfig: {
      minimaxEndpoint: 'https://api.minimax.io/v1/t2a_v2',
      minimaxApiKey: 'test-key',
      minimaxGroupId: '',
      minimaxVoiceId: 'global-voice',
      minimaxModel: 'speech-02-turbo',
      edgeEndpoint: '',
      edgeVoiceId: 'zh-CN-XiaoxiaoNeural'
    }
  },
  synthesizeMiniMax: vi.fn(),
  writeMiniMaxCacheEntry: vi.fn()
}))

vi.mock('../stores/contacts', () => ({
  useContactsStore: () => mocks.contactsStore
}))

vi.mock('../stores/settings', () => ({
  useSettingsStore: () => mocks.settingsStore
}))

vi.mock('./voicePlayback/minimaxClient', () => ({
  buildMiniMaxCacheKey: (_endpoint, _model, voiceId, text, signature) => `cache:${voiceId}:${signature}:${text}`,
  extractEmotionTag: () => 'normal',
  fetchAudioAsBytes: vi.fn(),
  normalizeEmotionKey: value => String(value || 'normal'),
  resolveMiniMaxVoiceTuning: () => ({
    speed: 1,
    vol: 1,
    pitch: 0,
    emotion: 'normal',
    signature: 'test-sig'
  }),
  synthesizeMiniMax: mocks.synthesizeMiniMax,
  trimText: text => String(text || '').trim()
}))

vi.mock('./voicePlayback/minimaxCache', () => ({
  createObjectUrlFromBytes: vi.fn(() => 'blob:test-audio'),
  readMiniMaxCachedAudio: vi.fn(async () => null),
  toUint8Array: value => value,
  withMiniMaxInflight: vi.fn(async (_key, producer) => await producer()),
  writeMiniMaxCacheEntry: mocks.writeMiniMaxCacheEntry
}))

import { useVoicePlayback } from './useVoicePlayback'

class AudioMock {
  constructor(src) {
    this.src = src
    this.volume = 1
    this.onended = null
    this.onerror = null
  }

  play() {
    return Promise.resolve()
  }

  pause() {}
}

describe('useVoicePlayback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('Audio', AudioMock)
    mocks.contactsStore.contacts = []
    mocks.contactsStore.activeChat = null
    mocks.settingsStore.voiceTtsMode = 'minimax'
    mocks.settingsStore.voiceTtsConfig = {
      minimaxEndpoint: 'https://api.minimax.io/v1/t2a_v2',
      minimaxApiKey: 'test-key',
      minimaxGroupId: '',
      minimaxVoiceId: 'global-voice',
      minimaxModel: 'speech-02-turbo',
      edgeEndpoint: '',
      edgeVoiceId: 'zh-CN-XiaoxiaoNeural'
    }
    mocks.synthesizeMiniMax.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'audio/mpeg'
    })
  })

  it('uses the direct contact MiniMax voice instead of the global default', async () => {
    mocks.contactsStore.contacts = [
      { id: 101, minimaxVoiceId: 'role-voice-1' }
    ]
    mocks.contactsStore.activeChat = { id: 'chat-1', msgs: [] }

    const { play } = useVoicePlayback()
    await play({
      contactId: '101',
      text: '你好'
    })

    expect(mocks.synthesizeMiniMax).toHaveBeenCalledTimes(1)
    expect(mocks.synthesizeMiniMax.mock.calls[0][0]).toMatchObject({
      voiceId: 'role-voice-1',
      text: '你好'
    })
  })

  it('uses the sanitized default MiniMax voice in a private chat when the contact voice is blank', async () => {
    mocks.settingsStore.voiceTtsConfig.minimaxVoiceId = 'voice_id: "global-clone-voice"'
    mocks.contactsStore.contacts = [
      { id: 'chat-1', minimaxVoiceId: '' }
    ]
    mocks.contactsStore.activeChat = { id: 'chat-1', msgs: [] }

    const { play } = useVoicePlayback()
    await play({
      text: '你好'
    })

    expect(mocks.synthesizeMiniMax).toHaveBeenCalledTimes(1)
    expect(mocks.synthesizeMiniMax.mock.calls[0][0]).toMatchObject({
      voiceId: 'global-clone-voice',
      text: '你好'
    })
  })

  it('sanitizes contact MiniMax voice ids before playback', async () => {
    mocks.contactsStore.contacts = [
      { id: 'chat-1', minimaxVoiceId: '{"voice_id":"role-clone-voice"}' }
    ]
    mocks.contactsStore.activeChat = { id: 'chat-1', msgs: [] }

    const { play } = useVoicePlayback()
    await play({
      contactId: 'chat-1',
      text: '你好'
    })

    expect(mocks.synthesizeMiniMax).toHaveBeenCalledTimes(1)
    expect(mocks.synthesizeMiniMax.mock.calls[0][0]).toMatchObject({
      voiceId: 'role-clone-voice',
      text: '你好'
    })
  })

  it('resolves group message speakers to their bound contact MiniMax voice', async () => {
    mocks.contactsStore.contacts = [
      { id: 'role-2', minimaxVoiceId: 'role-voice-2' }
    ]
    mocks.contactsStore.activeChat = {
      id: 'group-1',
      type: 'group',
      members: [
        { id: 'member-1', contactId: 'role-2', name: '角色二' }
      ],
      msgs: [
        { id: 'msg-1', role: 'assistant', senderId: 'member-1', content: '(voice:你好)' }
      ]
    }

    const { play } = useVoicePlayback()
    await play({
      msgId: 'msg-1',
      text: '你好'
    })

    expect(mocks.synthesizeMiniMax).toHaveBeenCalledTimes(1)
    expect(mocks.synthesizeMiniMax.mock.calls[0][0]).toMatchObject({
      voiceId: 'role-voice-2',
      text: '你好'
    })
  })
})
