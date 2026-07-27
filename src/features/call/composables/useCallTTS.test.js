import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const play = vi.fn()
  return {
    play,
    stopPlayback: vi.fn(),
    callActive: { value: true },
    aiSpeaking: { value: false },
    callContactId: { value: '' }
  }
})

vi.mock('../../../stores/settings', () => ({
  useSettingsStore: () => ({
    voiceTtsMode: 'minimax'
  })
}))

vi.mock('../../../composables/useVoicePlayback', () => ({
  useVoicePlayback: () => ({
    play: mocks.play,
    stop: mocks.stopPlayback
  })
}))

vi.mock('./useCallState', () => ({
  useCallState: () => ({
    aiSpeaking: mocks.aiSpeaking,
    callActive: mocks.callActive,
    callContactId: mocks.callContactId
  })
}))

vi.mock('../../../utils/ttsSegmentation', () => ({
  splitForVoiceMode: (text) => [text]
}))

import { useCallTTS } from './useCallTTS'

describe('useCallTTS', () => {
  beforeEach(() => {
    mocks.play.mockReset()
    mocks.stopPlayback.mockReset()
    mocks.callActive.value = true
    mocks.aiSpeaking.value = false
    mocks.callContactId.value = ''

    mocks.play.mockImplementation(async (options = {}) => {
      options.onEnded?.()
    })
  })

  it('forwards contactId so role-specific MiniMax voices are preserved during calls', async () => {
    const { speakSentence } = useCallTTS()

    await speakSentence('你好', {
      contactId: 'contact-1',
      emotion: 'happy'
    })

    expect(mocks.play).toHaveBeenCalledTimes(1)
    expect(mocks.play.mock.calls[0][0]).toMatchObject({
      contactId: 'contact-1',
      text: '你好',
      emotion: 'happy',
      stableTimbre: true
    })
  })

  it('falls back to the active call contactId when sentence options omit it', async () => {
    mocks.callContactId.value = 'active-call-contact'
    const { speakSentence } = useCallTTS()

    await speakSentence('你好')

    expect(mocks.play).toHaveBeenCalledTimes(1)
    expect(mocks.play.mock.calls[0][0]).toMatchObject({
      contactId: 'active-call-contact',
      text: '你好'
    })
  })
})
