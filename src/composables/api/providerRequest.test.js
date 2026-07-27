import { beforeEach, describe, expect, it, vi } from 'vitest'

const openAIMocks = vi.hoisted(() => ({
  buildOpenAICompatHeaders: vi.fn((apiKey) => ({ Authorization: `Bearer ${apiKey}` })),
  fetchOpenAICompat: vi.fn(),
  readOpenAICompatError: vi.fn()
}))

vi.mock('./openaiCompat', () => ({
  buildOpenAICompatHeaders: openAIMocks.buildOpenAICompatHeaders,
  fetchOpenAICompat: openAIMocks.fetchOpenAICompat,
  readOpenAICompatError: openAIMocks.readOpenAICompatError
}))

import {
  API_FORMAT_ANTHROPIC_MESSAGES,
  API_FORMAT_GEMINI_GENERATE_CONTENT,
  API_FORMAT_OPENAI_COMPATIBLE,
  API_FORMAT_OPENAI_RESPONSES
} from './providerFormats'
import {
  buildProviderChatPayload,
  buildProviderNonStreamingPayload,
  consumeProviderChatStream,
  fetchProviderChat,
  fetchProviderModels,
  readProviderChatError
} from './providerRequest'

function createOkResponse(text = '{}') {
  return new Response(text, { status: 200 })
}

describe('providerRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn().mockResolvedValue(createOkResponse())
    openAIMocks.fetchOpenAICompat.mockResolvedValue({
      request: { targetUrl: 'https://openai.test/v1/chat/completions' },
      response: createOkResponse()
    })
    openAIMocks.readOpenAICompatError.mockResolvedValue('openai error')
  })

  it('keeps OpenAI-compatible payload and fetch behavior on old configs', async () => {
    const cfg = {
      url: 'https://openai.test/v1',
      key: 'openai-key',
      model: 'gpt-test',
      apiFormat: API_FORMAT_OPENAI_COMPATIBLE
    }
    const messages = [{ role: 'user', content: 'Hi' }]

    const payload = buildProviderChatPayload(cfg, messages)
    expect(payload).toMatchObject({
      model: 'gpt-test',
      messages,
      stream: true,
      stream_options: { include_usage: true }
    })

    await fetchProviderChat(cfg, payload)
    expect(openAIMocks.fetchOpenAICompat).toHaveBeenCalledWith('https://openai.test/v1', {
      apiKey: 'openai-key',
      body: payload
    })
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('builds Gemini non-stream requests without an unsupported stream field', () => {
    const cfg = {
      url: 'https://generativelanguage.googleapis.com/v1beta',
      key: 'gemini-key',
      model: 'gemini-flash',
      apiFormat: API_FORMAT_GEMINI_GENERATE_CONTENT
    }

    const streamingRequest = buildProviderChatPayload(cfg, [{ role: 'user', content: 'Hi' }])
    const request = buildProviderNonStreamingPayload(cfg, streamingRequest)

    expect(request.url).toContain(':generateContent')
    expect(request.url).not.toContain(':streamGenerateContent')
    expect(request.body).not.toHaveProperty('stream')
  })

  it('sends native Anthropic requests with custom headers and body applied last', async () => {
    const cfg = {
      url: 'https://api.anthropic.com',
      key: 'anthropic-key',
      model: 'claude-sonnet',
      apiFormat: API_FORMAT_ANTHROPIC_MESSAGES,
      customHeadersJson: '{"anthropic-version":"2024-01-01","x-extra":"1"}',
      customBodyJson: '{"metadata":{"source":"test"}}'
    }
    const request = buildProviderChatPayload(cfg, [{ role: 'user', content: 'Hi' }])
    const result = await fetchProviderChat(cfg, request)

    expect(result.request.targetUrl).toBe('https://api.anthropic.com/v1/messages')
    expect(globalThis.fetch).toHaveBeenCalledWith('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: expect.objectContaining({
        'x-api-key': 'anthropic-key',
        'anthropic-version': '2024-01-01',
        'x-extra': '1'
      }),
      body: JSON.stringify({
        ...request.body,
        metadata: { source: 'test' }
      })
    })
  })

  it('automatically removes unsupported sampling parameters from Claude Opus 4.7 requests', () => {
    const request = buildProviderChatPayload({
      url: 'https://api.anthropic.com',
      key: 'anthropic-key',
      model: 'claude-opus-4-7',
      temperature: 0.7,
      apiFormat: API_FORMAT_ANTHROPIC_MESSAGES,
      customBodyJson: '{"top_p":0.9,"top_k":40}'
    }, [{ role: 'user', content: 'Hi' }])

    expect(request.body).not.toHaveProperty('temperature')
    expect(request.body).not.toHaveProperty('top_p')
    expect(request.body).not.toHaveProperty('top_k')
  })

  it('applies explicit nested removals after provider body normalization', () => {
    const request = buildProviderChatPayload({
      url: 'https://generativelanguage.googleapis.com/v1beta',
      key: 'gemini-key',
      model: 'gemini-flash',
      apiFormat: API_FORMAT_GEMINI_GENERATE_CONTENT,
      customBodyJson: '{"temperature":0.4,"generationConfig":{"topP":0.9}}',
      removeBodyParams: ['generationConfig.temperature', 'generationConfig.topP']
    }, [{ role: 'user', content: 'Hi' }])

    expect(request.body.generationConfig).toEqual({})
  })

  it('forwards validated custom headers for OpenAI-compatible and Responses requests', async () => {
    const compatibleCfg = {
      url: 'https://openai.test/v1',
      key: 'openai-key',
      model: 'gpt-test',
      apiFormat: API_FORMAT_OPENAI_COMPATIBLE,
      customHeadersJson: '{"HTTP-Referer":"https://app.example"}'
    }
    const compatiblePayload = buildProviderChatPayload(compatibleCfg, [{ role: 'user', content: 'Hi' }])
    await fetchProviderChat(compatibleCfg, compatiblePayload)

    expect(openAIMocks.fetchOpenAICompat).toHaveBeenLastCalledWith('https://openai.test/v1', {
      apiKey: 'openai-key',
      body: compatiblePayload,
      extraHeaders: { 'HTTP-Referer': 'https://app.example' }
    })

    const responsesCfg = {
      ...compatibleCfg,
      apiFormat: API_FORMAT_OPENAI_RESPONSES
    }
    const responsesRequest = buildProviderChatPayload(responsesCfg, [{ role: 'user', content: 'Hi' }])
    await fetchProviderChat(responsesCfg, responsesRequest)

    expect(openAIMocks.fetchOpenAICompat).toHaveBeenLastCalledWith('https://openai.test/v1', {
      path: '/responses',
      apiKey: 'openai-key',
      body: responsesRequest.body,
      extraHeaders: { 'HTTP-Referer': 'https://app.example' }
    })
  })

  it('sends native Gemini requests', async () => {
    const cfg = {
      url: 'https://generativelanguage.googleapis.com/v1beta',
      key: 'gemini-key',
      model: 'gemini-flash',
      apiFormat: API_FORMAT_GEMINI_GENERATE_CONTENT
    }
    const request = buildProviderChatPayload(cfg, [{ role: 'user', content: 'Hi' }])
    await fetchProviderChat(cfg, request)

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash:streamGenerateContent',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goog-api-key': 'gemini-key' })
      })
    )
  })

  it('routes stream consumers and error readers by provider format', async () => {
    const anthropicResponse = new Response('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"A"}}\n\n')
    const anthropicChunks = []
    await expect(consumeProviderChatStream({ apiFormat: API_FORMAT_ANTHROPIC_MESSAGES }, anthropicResponse, delta => anthropicChunks.push(delta)))
      .resolves.toMatchObject({ emittedChars: 1 })
    expect(anthropicChunks).toEqual(['A'])

    const geminiResponse = new Response('data: {"candidates":[{"content":{"parts":[{"text":"G"}]}}]}\n\n')
    const geminiChunks = []
    await expect(consumeProviderChatStream({ apiFormat: API_FORMAT_GEMINI_GENERATE_CONTENT }, geminiResponse, delta => geminiChunks.push(delta)))
      .resolves.toMatchObject({ emittedChars: 1 })
    expect(geminiChunks).toEqual(['G'])

    await expect(readProviderChatError({ apiFormat: API_FORMAT_OPENAI_COMPATIBLE }, createOkResponse())).resolves.toBe('openai error')
    expect(openAIMocks.readOpenAICompatError).toHaveBeenCalled()
  })

  it('uses the OpenAI tool-aware stream parser when requested', async () => {
    const response = new Response([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"write_diary","arguments":"{\\"content\\":"}}]},"finish_reason":null}]}',
      '',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"今天很好\\"}"}}]},"finish_reason":"tool_calls"}]}',
      '',
      'data: [DONE]',
      ''
    ].join('\n'))

    const result = await consumeProviderChatStream({ apiFormat: API_FORMAT_OPENAI_COMPATIBLE }, response, () => {}, {
      toolAware: true
    })

    expect(result.toolCalls).toEqual([
      {
        id: 'call_1',
        type: 'function',
        function: {
          name: 'write_diary',
          arguments: '{"content":"今天很好"}'
        }
      }
    ])
  })

  it('fetches model lists using provider-native endpoints', async () => {
    openAIMocks.fetchOpenAICompat.mockResolvedValueOnce({
      request: { targetUrl: 'https://openai.test/v1/models' },
      response: new Response('{"data":[{"id":"gpt-4o"},{"id":"gpt-4.1"}]}')
    })
    await expect(fetchProviderModels({
      url: 'https://openai.test/v1',
      key: 'openai-key',
      apiFormat: API_FORMAT_OPENAI_COMPATIBLE
    })).resolves.toEqual({
      request: expect.objectContaining({ targetUrl: 'https://openai.test/v1/models' }),
      models: ['gpt-4.1', 'gpt-4o']
    })

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response('{"data":[{"id":"claude-sonnet-4-5"},{"id":"claude-opus-4-1"}]}'))
      .mockResolvedValueOnce(new Response('{"models":[{"name":"models/gemini-2.5-flash"},{"name":"models/gemini-2.5-pro"}]}'))

    await expect(fetchProviderModels({
      url: 'https://api.anthropic.com',
      key: 'anthropic-key',
      apiFormat: API_FORMAT_ANTHROPIC_MESSAGES,
      customHeadersJson: '{"anthropic-version":"2024-01-01"}'
    })).resolves.toEqual({
      request: expect.objectContaining({ targetUrl: 'https://api.anthropic.com/v1/models' }),
      models: ['claude-opus-4-1', 'claude-sonnet-4-5']
    })
    expect(globalThis.fetch).toHaveBeenNthCalledWith(1, 'https://api.anthropic.com/v1/models', expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({
        'x-api-key': 'anthropic-key',
        'anthropic-version': '2024-01-01'
      })
    }))

    await expect(fetchProviderModels({
      url: 'https://generativelanguage.googleapis.com/v1beta',
      key: 'gemini-key',
      apiFormat: API_FORMAT_GEMINI_GENERATE_CONTENT
    })).resolves.toEqual({
      request: expect.objectContaining({ targetUrl: 'https://generativelanguage.googleapis.com/v1beta/models' }),
      models: ['gemini-2.5-flash', 'gemini-2.5-pro']
    })
    expect(globalThis.fetch).toHaveBeenNthCalledWith(2, 'https://generativelanguage.googleapis.com/v1beta/models', expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({ 'x-goog-api-key': 'gemini-key' })
    }))
  })

  it('falls back to OpenAI-style model listing when native anthropic request fails (relay/CORS)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    openAIMocks.fetchOpenAICompat.mockResolvedValueOnce({
      request: { targetUrl: 'https://openrouter.ai/api/v1/models' },
      response: new Response('{"data":[{"id":"anthropic/claude-sonnet-4.6"}]}')
    })

    await expect(fetchProviderModels({
      url: 'https://openrouter.ai/api/v1',
      key: 'or-key',
      apiFormat: API_FORMAT_ANTHROPIC_MESSAGES
    })).resolves.toEqual({
      request: expect.objectContaining({ targetUrl: 'https://openrouter.ai/api/v1/models' }),
      models: ['anthropic/claude-sonnet-4.6']
    })
    expect(openAIMocks.fetchOpenAICompat).toHaveBeenCalledWith('https://openrouter.ai/api/v1', expect.objectContaining({
      path: '/models',
      method: 'GET',
      apiKey: 'or-key'
    }))
  })

  it('reports the native anthropic error when the OpenAI-style fallback also fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    openAIMocks.fetchOpenAICompat.mockRejectedValueOnce(new Error('fallback failed'))

    await expect(fetchProviderModels({
      url: 'https://api.anthropic.com',
      key: 'anthropic-key',
      apiFormat: API_FORMAT_ANTHROPIC_MESSAGES
    })).rejects.toThrow('Failed to fetch')
  })

  it('sends the dangerous-direct-browser-access header on native anthropic model requests', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('{"data":[{"id":"claude-opus-4-7"}]}'))

    await fetchProviderModels({
      url: 'https://api.anthropic.com',
      key: 'anthropic-key',
      apiFormat: API_FORMAT_ANTHROPIC_MESSAGES
    })
    expect(globalThis.fetch).toHaveBeenCalledWith('https://api.anthropic.com/v1/models', expect.objectContaining({
      headers: expect.objectContaining({
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      })
    }))
  })

  it('uses CORS-safe relay headers for anthropic requests to non-official hosts', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('{"data":[{"id":"anthropic/claude-sonnet-4.6"}]}'))

    await fetchProviderModels({
      url: 'https://openrouter.ai/api/v1',
      key: 'or-key',
      apiFormat: API_FORMAT_ANTHROPIC_MESSAGES
    })
    const [, init] = globalThis.fetch.mock.calls[0]
    expect(init.headers).toMatchObject({
      'x-api-key': 'or-key',
      Authorization: 'Bearer or-key'
    })
    expect(init.headers['anthropic-version']).toBeUndefined()
    expect(init.headers['anthropic-dangerous-direct-browser-access']).toBeUndefined()
  })
})
