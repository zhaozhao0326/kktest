import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateOpenAIImage } from './openaiImages'

const SAMPLE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+R6kAAAAASUVORK5CYII='

function jsonResponse(data) {
  return {
    ok: true,
    status: 200,
    async json() {
      return data
    },
    async text() {
      return JSON.stringify(data)
    }
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('GPT Image / OpenAI Images generation', () => {
  it('posts to images/generations when configured with a base URL', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      data: [{ b64_json: SAMPLE_PNG_BASE64 }]
    }))
    vi.stubGlobal('fetch', fetchMock)

    const imageUrl = await generateOpenAIImage(
      'portrait',
      {
        apiKey: 'test-key',
        endpoint: 'https://third.example/v1',
        model: 'gpt-image2',
        size: 'portrait',
        quality: 'high',
        outputFormat: 'webp'
      }
    )

    expect(imageUrl).toBe(`data:image/png;base64,${SAMPLE_PNG_BASE64}`)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://third.example/v1/images/generations')
    expect(init.headers.Authorization).toBe('Bearer test-key')
    const body = JSON.parse(init.body)
    expect(body).toMatchObject({
      model: 'gpt-image2',
      prompt: 'portrait',
      size: '1024x1536',
      quality: 'high',
      output_format: 'webp'
    })
  })

  it('accepts a complete generations endpoint without appending the path again', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      data: [{ url: 'https://img.example/out.png' }]
    }))
    vi.stubGlobal('fetch', fetchMock)

    await generateOpenAIImage(
      'landscape',
      {
        apiKeyMode: 'none',
        endpoint: 'https://third.example/v1/images/generations',
        model: 'gpt-image2'
      },
      {
        aspectRatio: '16:9'
      }
    )

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://third.example/v1/images/generations')
    expect(JSON.parse(init.body).size).toBe('1536x1024')
  })

  it('allows third-party compatible endpoints without an API key', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      data: [{ url: 'https://img.example/free.png' }]
    }))
    vi.stubGlobal('fetch', fetchMock)

    await generateOpenAIImage(
      'free station prompt',
      {
        endpoint: 'https://free.example/v1',
        model: 'gpt-image2'
      }
    )

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://free.example/v1/images/generations')
    expect(init.headers.Authorization).toBeUndefined()
  })

  it('ignores a stale key completely when authentication is disabled', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      data: [{ url: 'https://img.example/no-auth.png' }]
    }))
    vi.stubGlobal('fetch', fetchMock)

    await generateOpenAIImage('no auth', {
      apiKeyMode: 'none',
      apiKey: '旧密钥：不用了',
      endpoint: 'https://free.example/v1'
    })

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined()
  })

  it('uses custom dimensions only when third-party custom size support is enabled', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      data: [{ b64_json: SAMPLE_PNG_BASE64 }]
    }))
    vi.stubGlobal('fetch', fetchMock)

    await generateOpenAIImage(
      'sprite',
      {
        apiKeyMode: 'none',
        endpoint: 'https://third.example/v1',
        allowCustomSize: true
      },
      {
        width: 832,
        height: 1216
      }
    )

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).size).toBe('832x1216')
  })

  it('uses Chat Completions for OpenRouter-compatible custom URLs and model ids', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      choices: [
        {
          message: {
            images: [
              {
                image_url: {
                  url: `data:image/png;base64,${SAMPLE_PNG_BASE64}`
                }
              }
            ]
          }
        }
      ]
    }))
    vi.stubGlobal('fetch', fetchMock)

    const imageUrl = await generateOpenAIImage(
      'city at sunset',
      {
        apiKey: 'or-key',
        endpoint: 'https://openrouter.ai/api/v1',
        model: 'openai/gpt-image-1',
        apiMode: 'auto',
        size: 'landscape'
      }
    )

    expect(imageUrl).toBe(`data:image/png;base64,${SAMPLE_PNG_BASE64}`)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer or-key')
    const body = JSON.parse(init.body)
    expect(body.model).toBe('openai/gpt-image-1')
    expect(body.modalities).toEqual(['image', 'text'])
    expect(body.messages[0]).toMatchObject({
      role: 'user',
      content: 'city at sunset'
    })
    expect(body.image_config).toMatchObject({
      aspect_ratio: '3:2',
      size: '1536x1024'
    })
  })

  it('can send image references through a complete custom chat endpoint', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      choices: [
        {
          message: {
            content: `![result](data:image/png;base64,${SAMPLE_PNG_BASE64})`
          }
        }
      ]
    }))
    vi.stubGlobal('fetch', fetchMock)

    await generateOpenAIImage(
      'edit the expression',
      {
        apiKeyMode: 'none',
        endpoint: 'https://proxy.example/v1/chat/completions',
        model: 'vendor/custom-image-model',
        apiMode: 'chat',
        imageSize: '2K'
      },
      {
        baseImage: SAMPLE_PNG_BASE64,
        aspectRatio: '1:1'
      }
    )

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://proxy.example/v1/chat/completions')
    const body = JSON.parse(init.body)
    expect(body.model).toBe('vendor/custom-image-model')
    expect(body.image_config).toMatchObject({
      aspect_ratio: '1:1',
      image_size: '2K'
    })
    expect(body.messages[0].content).toEqual([
      { type: 'text', text: 'edit the expression' },
      {
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${SAMPLE_PNG_BASE64}` }
      }
    ])
  })
})
