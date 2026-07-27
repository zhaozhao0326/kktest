import { describe, expect, it } from 'vitest'
import { sanitizeMiniMaxGroupId, sanitizeMiniMaxVoiceId } from './minimaxConfig'

describe('minimax config helpers', () => {
  it('keeps plain group ids and strips endpoint-shaped group ids', () => {
    expect(sanitizeMiniMaxGroupId(' group-1 ')).toBe('group-1')
    expect(sanitizeMiniMaxGroupId('https://api.minimax.io/v1/t2a_v2')).toBe('')
  })

  it('normalizes MiniMax voice ids copied from common structured formats', () => {
    expect(sanitizeMiniMaxVoiceId(' "clone-voice-1" ')).toBe('clone-voice-1')
    expect(sanitizeMiniMaxVoiceId('voice_id: "clone-voice-2"')).toBe('clone-voice-2')
    expect(sanitizeMiniMaxVoiceId('{"voice_setting":{"voice_id":"clone-voice-3"}}')).toBe('clone-voice-3')
    expect(sanitizeMiniMaxVoiceId('https://example.test/path?voice_id=clone-voice-4')).toBe('clone-voice-4')
  })

  it('removes invisible copy-paste characters from MiniMax voice ids', () => {
    expect(sanitizeMiniMaxVoiceId('\uFEFFclone\u200B-voice\u2060-5')).toBe('clone-voice-5')
  })
})
