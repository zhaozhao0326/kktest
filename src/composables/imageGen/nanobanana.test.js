import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateNanoBanana } from './nanobanana'

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

describe('nanobanana image generation', () => {
  it('maps the retired preview model and sends current Gemini response format fields', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      candidates: [
        {
          content: {
            parts: [
              { inlineData: { mimeType: 'image/png', data: SAMPLE_PNG_BASE64 } }
            ]
          }
        }
      ]
    }))
    vi.stubGlobal('fetch', fetchMock)

    const imageUrl = await generateNanoBanana(
      'sprite',
      {
        apiKeyMode: 'none',
        model: 'gemini-2.5-flash-image-preview'
      },
      {
        width: 832,
        height: 1216
      }
    )

    expect(imageUrl).toBe(`data:image/png;base64,${SAMPLE_PNG_BASE64}`)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/models/gemini-2.5-flash-image:generateContent')

    const body = JSON.parse(init.body)
    expect(body.generationConfig.responseFormat).toEqual({
      image: {
        aspectRatio: '2:3'
      }
    })
    expect(body.generationConfig.imageConfig).toBeUndefined()
  })

  it('uses response_format for Gemini OpenAI chat image options', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      choices: [
        {
          message: {
            content: `data:image/png;base64,${SAMPLE_PNG_BASE64}`
          }
        }
      ]
    }))
    vi.stubGlobal('fetch', fetchMock)

    await generateNanoBanana(
      'sprite',
      {
        apiMode: 'openai_chat',
        apiKeyMode: 'none',
        extraBody: '{"google":{"image_config":{"aspect_ratio":"1:1"}}}'
      },
      {
        width: 832,
        height: 1216
      }
    )

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.extra_body.google.response_format).toEqual({
      image: {
        aspect_ratio: '2:3'
      }
    })
    expect(body.extra_body.google.image_config).toBeUndefined()
  })

  it('allows third-party OpenAI compatible image endpoints without an API key', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      data: [
        { b64_json: SAMPLE_PNG_BASE64 }
      ]
    }))
    vi.stubGlobal('fetch', fetchMock)

    await generateNanoBanana(
      'sprite',
      {
        apiMode: 'openai_images',
        endpoint: 'https://free.example/v1',
        model: 'gemini-2.5-flash-image'
      },
      {
        width: 512,
        height: 512
      }
    )

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://free.example/v1/images/generations')
    expect(init.headers.Authorization).toBeUndefined()
  })

  it('ignores a stale key completely when authentication is disabled', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      data: [{ b64_json: SAMPLE_PNG_BASE64 }]
    }))
    vi.stubGlobal('fetch', fetchMock)

    await generateNanoBanana('sprite', {
      apiMode: 'openai_images',
      apiKeyMode: 'none',
      apiKey: '旧密钥：不用了',
      endpoint: 'https://free.example/v1'
    })

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined()
  })
})
