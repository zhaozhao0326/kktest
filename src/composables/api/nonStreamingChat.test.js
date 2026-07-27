import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  buildProviderChatPayload: vi.fn(),
  buildProviderNonStreamingPayload: vi.fn(),
  extractProviderNonStreamText: vi.fn(),
  fetchProviderChat: vi.fn(),
  readProviderChatError: vi.fn()
}))

vi.mock('./providerRequest', () => mocks)

import { requestNonStreamingChatText } from './nonStreamingChat'

describe('requestNonStreamingChatText', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.buildProviderChatPayload.mockReturnValue({ stream: true })
    mocks.buildProviderNonStreamingPayload.mockReturnValue({ stream: false })
    mocks.fetchProviderChat.mockResolvedValue({
      request: { targetUrl: 'https://provider.test/messages' },
      response: { ok: true, json: vi.fn().mockResolvedValue({ output: 'ok' }) }
    })
    mocks.extractProviderNonStreamText.mockReturnValue('provider text')
  })

  it('routes one-shot calls through the shared provider abstraction', async () => {
    const signal = new AbortController().signal
    const cfg = { model: 'model-a', temperature: 0.7 }
    const messages = [{ role: 'user', content: 'Hi' }]

    const result = await requestNonStreamingChatText(cfg, messages, {
      temperature: 0.2,
      maxTokens: 120,
      signal
    })

    expect(mocks.buildProviderChatPayload).toHaveBeenCalledWith(
      { ...cfg, temperature: 0.2 },
      messages,
      { maxTokens: 120 }
    )
    expect(mocks.buildProviderNonStreamingPayload).toHaveBeenCalledWith(
      { ...cfg, temperature: 0.2 },
      { stream: true }
    )
    expect(mocks.fetchProviderChat).toHaveBeenCalledWith(
      { ...cfg, temperature: 0.2 },
      { stream: false },
      { signal }
    )
    expect(result).toEqual({
      content: 'provider text',
      data: { output: 'ok' },
      url: 'https://provider.test/messages'
    })
  })

  it('surfaces provider-specific non-2xx errors', async () => {
    const response = { ok: false }
    mocks.fetchProviderChat.mockResolvedValue({ request: {}, response })
    mocks.readProviderChatError.mockResolvedValue('provider rejected request')

    await expect(requestNonStreamingChatText({}, [])).rejects.toThrow('provider rejected request')
    expect(mocks.readProviderChatError).toHaveBeenCalledWith({}, response)
  })
})
