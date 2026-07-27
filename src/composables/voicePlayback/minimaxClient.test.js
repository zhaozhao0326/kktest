import { describe, expect, it, vi } from 'vitest'
import {
  buildMiniMaxCacheKey,
  buildMiniMaxEndpointCandidates,
  normalizeMiniMaxEndpoint,
  normalizeMiniMaxModelName,
  resolveMiniMaxVoiceTuning,
  synthesizeMiniMax,
  trimText
} from './minimaxClient'

describe('minimax client helpers', () => {
  it('normalizes common model aliases', () => {
    expect(normalizeMiniMaxModelName('speech2.8-turbo')).toBe('speech-2.8-turbo')
    expect(normalizeMiniMaxModelName('speech-02-hd')).toBe('speech-02-hd')
  })

  it('normalizes endpoint and expands backup hosts', () => {
    expect(normalizeMiniMaxEndpoint('api.minimax.io')).toBe('https://api.minimax.io/v1/t2a_v2')
    expect(buildMiniMaxEndpointCandidates('https://api.minimax.io/v1')).toEqual([
      'https://api.minimax.io/v1/t2a_v2',
      'https://api-uw.minimax.io/v1/t2a_v2'
    ])
  })

  it('builds stable cache keys across host aliases and whitespace noise', () => {
    const left = buildMiniMaxCacheKey('https://api-uw.minimax.io/v1/t2a_v2', 'speech2.8-turbo', 'voiceA', 'hello\n\nworld', 'sig')
    const right = buildMiniMaxCacheKey('https://api.minimax.io/v1/t2a_v2', 'speech-2.8-turbo', 'voiceA', 'hello\n\nworld', 'sig')

    expect(left).toBe(right)
  })

  it('keeps trimText and tuning signatures deterministic', () => {
    expect(trimText(' [emotion:happy]*你好* ')).toBe('你好')

    expect(resolveMiniMaxVoiceTuning('你好！', 'happy')).toEqual({
      speed: 1.04,
      pitch: 0.21,
      vol: 1.12,
      emotion: 'happy',
      signature: 'natural-v1:happy:1.04:0.21:1.12'
    })
  })

  it('includes the requested voice_id in MiniMax request bodies', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        base_resp: { status_code: 0, status_msg: 'ok' },
        data: { audio: '00' }
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    try {
      await synthesizeMiniMax({
        endpoint: 'https://api.minimax.io/v1/t2a_v2',
        apiKey: 'test-key',
        groupId: '',
        model: 'speech-02-turbo',
        text: 'hello',
        voiceId: 'role-voice-1',
        voiceTuning: null
      })

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [, request] = fetchMock.mock.calls[0]
      const body = JSON.parse(String(request?.body || '{}'))
      expect(body.voice_setting?.voice_id).toBe('role-voice-1')
      expect(body.voice_setting).not.toHaveProperty('emotion')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('sanitizes pasted voice_id values before sending MiniMax requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        base_resp: { status_code: 0, status_msg: 'ok' },
        data: { audio: '00' }
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    try {
      await synthesizeMiniMax({
        endpoint: 'https://api.minimax.io/v1/t2a_v2',
        apiKey: 'test-key',
        groupId: '',
        model: 'speech-02-turbo',
        text: 'hello',
        voiceId: 'voice_id: "clone-voice-from-settings"',
        voiceTuning: null
      })

      const [, request] = fetchMock.mock.calls[0]
      const body = JSON.parse(String(request?.body || '{}'))
      expect(body.voice_setting?.voice_id).toBe('clone-voice-from-settings')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('keeps the voice_id and safe tuning when retrying MiniMax invalid params', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          base_resp: { status_code: 2013, status_msg: 'invalid params' }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          base_resp: { status_code: 0, status_msg: 'ok' },
          data: { audio: '00' }
        })
      })

    vi.stubGlobal('fetch', fetchMock)

    try {
      await synthesizeMiniMax({
        endpoint: 'https://api.minimax.io/v1/t2a_v2',
        apiKey: 'test-key',
        groupId: '',
        model: 'speech-02-turbo',
        text: 'hello',
        voiceId: 'clone-voice-1',
        voiceTuning: {
          speed: 1.08,
          vol: 1.12,
          pitch: 0.5,
          emotion: 'happy'
        }
      })

      expect(fetchMock).toHaveBeenCalledTimes(2)
      const firstBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body || '{}'))
      const retryBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body || '{}'))

      expect(firstBody.voice_setting).toEqual({
        voice_id: 'clone-voice-1',
        speed: 1.08,
        vol: 1.12,
        pitch: 6
      })
      expect(retryBody.voice_setting).toEqual({
        voice_id: 'clone-voice-1',
        speed: 1.08,
        vol: 1.12,
        pitch: 0
      })
      expect(retryBody.voice_setting).not.toHaveProperty('emotion')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('falls back to a minimal voice_id body only after tuned retries fail', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          base_resp: { status_code: 2013, status_msg: 'invalid params' }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          base_resp: { status_code: 2013, status_msg: 'invalid params' }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          base_resp: { status_code: 0, status_msg: 'ok' },
          data: { audio: '00' }
        })
      })

    vi.stubGlobal('fetch', fetchMock)

    try {
      await synthesizeMiniMax({
        endpoint: 'https://api.minimax.io/v1/t2a_v2',
        apiKey: 'test-key',
        groupId: '',
        model: 'speech-02-turbo',
        text: 'hello',
        voiceId: 'clone-voice-2',
        voiceTuning: {
          speed: 1.08,
          vol: 1.12,
          pitch: 0.5,
          emotion: 'happy'
        }
      })

      expect(fetchMock).toHaveBeenCalledTimes(3)
      const minimalBody = JSON.parse(String(fetchMock.mock.calls[2][1]?.body || '{}'))
      expect(minimalBody.voice_setting).toEqual({ voice_id: 'clone-voice-2' })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('fails fast when mandatory minimax config is missing', async () => {
    await expect(synthesizeMiniMax({
      endpoint: '',
      apiKey: '',
      groupId: '',
      model: '',
      text: 'hello',
      voiceId: '',
      voiceTuning: null
    })).rejects.toThrow('MiniMax endpoint is not configured')
  })
})
