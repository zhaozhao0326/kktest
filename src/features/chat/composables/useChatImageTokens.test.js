import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { useChatImageTokens } from './useChatImageTokens'

const SAMPLE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+R6kAAAAASUVORK5CYII='
const SAMPLE_IMAGE_DATA_URL = `data:image/png;base64,${SAMPLE_PNG_BASE64}`

const OriginalImage = globalThis.Image

function base64ToBytes(base64) {
  if (typeof atob === 'function') {
    const binary = atob(base64)
    return Uint8Array.from(binary, char => char.charCodeAt(0))
  }
  return Uint8Array.from(Buffer.from(base64, 'base64'))
}

beforeAll(() => {
  vi.stubGlobal('Image', class MockImage {
    set src(value) {
      queueMicrotask(() => {
        if (/^(?:data:image\/|blob:|https?:\/\/)/i.test(String(value || ''))) {
          this.onload?.()
        } else {
          this.onerror?.(new Event('error'))
        }
      })
    }
  })
})

afterAll(() => {
  if (OriginalImage) {
    vi.stubGlobal('Image', OriginalImage)
  } else {
    vi.unstubAllGlobals()
  }
})

function createHarness(options = {}) {
  const calls = []
  const albumAdds = []
  const toasts = []
  let idSeq = 0
  const provider = options.provider || 'novelai'
  const imageResult = options.imageResult || SAMPLE_IMAGE_DATA_URL

  const store = {
    allowAIImageGeneration: true,
    vnImageGenConfig: {
      provider,
      imageRequestTimeoutMs: options.imageRequestTimeoutMs,
      novelai: {
        width: 1024,
        height: 1024,
        model: 'nai-diffusion-4-5-full'
      },
      nanobanana: {
        model: 'gemini-2.5-flash-image-preview'
      },
      openaiImages: {
        model: 'gpt-image2',
        promptStyle: 'auto'
      }
    },
    activeChat: { id: 'c1' }
  }
  if (options.vnImageGenConfig && typeof options.vnImageGenConfig === 'object') {
    Object.assign(store.vnImageGenConfig, options.vnImageGenConfig)
  }

  const entry = {
    artistTags: 'artist:test_artist',
    basePrompt: 'silver_hair, blue_eyes, school_uniform',
    negativePrompt: 'bad_hands, extra_fingers',
    baseImage: {
      url: 'data:image/png;base64,ZmFrZV9iYXNl',
      params: {
        width: 832,
        height: 1216
      }
    },
    generationPrefs: {
      keepArtistTagsOnNonCharacterImage: false,
      characterRefEnabled: true,
      characterRefImage: 'data:image/png;base64,ZmFrZV9yZWY=',
      characterRefStrength: 0.65,
      characterRefFidelity: 0.5,
      characterRefMode: 'character_style',
      vibeReferences: []
    }
  }
  const resolvedEntry = {
    ...entry,
    ...(options.entry || {})
  }

  const chatImageTokens = useChatImageTokens({
    store,
    charResStore: {
      getEntry(contactId) {
        return contactId === 'c1' ? resolvedEntry : null
      }
    },
    albumStore: {
      addPhoto(payload) {
        albumAdds.push(payload)
      }
    },
    generateImage: async (prompt, genOptions) => {
      calls.push({ prompt, options: genOptions })
      if (typeof options.generateImage === 'function') {
        return await options.generateImage(prompt, genOptions)
      }
      return imageResult
    },
    makeId(prefix) {
      idSeq += 1
      return `${prefix}_${idSeq}`
    },
    showToast(message) {
      toasts.push(String(message || ''))
    },
    scrollToBottom() {}
  })

  return {
    calls,
    albumAdds,
    toasts,
    processAssistantImageTokens: chatImageTokens.processAssistantImageTokens,
    rerollImageMessage: chatImageTokens.rerollImageMessage,
    imageResult
  }
}

describe('useChatImageTokens', () => {
  it('keeps non-character images fully isolated from character prompt/options', async () => {
    const { calls, processAssistantImageTokens } = createHarness()
    const contact = {
      id: 'c1',
      name: 'Alice',
      msgs: [
        {
          id: 'msg_1',
          role: 'assistant',
          senderId: 'c1',
          senderName: 'Alice',
          content: '(image:type=scene, sunset, beach, no_people)'
        }
      ]
    }

    await processAssistantImageTokens(contact, new Set())

    expect(calls).toHaveLength(1)
    expect(calls[0].prompt).toBe('sunset, beach, no_people, masterpiece, best_quality, highres')
    expect(calls[0].prompt).not.toContain('silver_hair')
    expect(calls[0].prompt).not.toContain('artist:test_artist')
    expect(calls[0].options.width).toBe(832)
    expect(calls[0].options.height).toBe(1216)
    expect(calls[0].options.negativePromptAppend).toBe('bad_hands, extra_fingers')
    expect(calls[0].options.directorReferenceImages).toBeUndefined()
    expect(calls[0].options.baseImage).toBeUndefined()
  })

  it('still applies character prompt and references for default character images', async () => {
    const { calls, processAssistantImageTokens } = createHarness()
    const contact = {
      id: 'c1',
      name: 'Alice',
      msgs: [
        {
          id: 'msg_2',
          role: 'assistant',
          senderId: 'c1',
          senderName: 'Alice',
          content: '(image:smile, cafe)'
        }
      ]
    }

    await processAssistantImageTokens(contact, new Set())

    expect(calls).toHaveLength(1)
    expect(calls[0].prompt).toContain('artist:test_artist')
    expect(calls[0].prompt).toContain('silver_hair')
    expect(calls[0].options.width).toBe(832)
    expect(calls[0].options.height).toBe(1216)
    expect(calls[0].options.negativePromptAppend).toBe('bad_hands, extra_fingers')
    expect(calls[0].options.directorReferenceImages).toEqual(['ZmFrZV9yZWY='])
  })

  it('passes the configured image request timeout into chat generation', async () => {
    const { calls, processAssistantImageTokens } = createHarness({
      imageRequestTimeoutMs: 180_000
    })
    const contact = {
      id: 'c1',
      name: 'Alice',
      msgs: [
        {
          id: 'msg_timeout',
          role: 'assistant',
          senderId: 'c1',
          senderName: 'Alice',
          content: '(image:smile)'
        }
      ]
    }

    await processAssistantImageTokens(contact, new Set())

    expect(calls).toHaveLength(1)
    expect(calls[0].options.timeoutMs).toBe(180_000)
  })

  it('uses fallback prompt for nanobanana scene token without tags to avoid empty reply', async () => {
    const { calls, processAssistantImageTokens } = createHarness({
      provider: 'nanobanana',
      entry: {
        basePrompt: '',
        artistTags: '',
        negativePrompt: ''
      }
    })
    const contact = {
      id: 'c1',
      name: 'Alice',
      msgs: [
        {
          id: 'msg_3',
          role: 'assistant',
          senderId: 'c1',
          senderName: 'Alice',
          content: '(image:type=scene)'
        }
      ]
    }

    await processAssistantImageTokens(contact, new Set())

    expect(calls).toHaveLength(1)
    expect(calls[0].prompt).toBe('cinematic scene, atmospheric lighting, detailed composition')
    expect(contact.msgs.some(msg => msg.id === 'msg_3')).toBe(false)
    expect(contact.msgs.some(msg => msg.isImage && typeof msg.imageUrl === 'string')).toBe(true)
  })

  it('passes natural-language image token controls to GPT Image generation', async () => {
    const { calls, processAssistantImageTokens } = createHarness({
      provider: 'openai_images',
      entry: {
        basePrompt: 'blue-haired student in a navy school uniform',
        artistTags: '',
        negativePrompt: ''
      }
    })
    const contact = {
      id: 'c1',
      name: 'Alice',
      msgs: [
        {
          id: 'msg_gpt_image',
          role: 'assistant',
          senderId: 'c1',
          senderName: 'Alice',
          content: '(image:size=portrait, quality=high, format=webp, 在咖啡厅微笑着看窗外)'
        }
      ]
    }

    await processAssistantImageTokens(contact, new Set())

    expect(calls).toHaveLength(1)
    expect(calls[0].prompt).toContain('blue-haired student')
    expect(calls[0].prompt).toContain('在咖啡厅微笑着看窗外')
    expect(calls[0].options.size).toBe('1024x1536')
    expect(calls[0].options.openaiSize).toBe('1024x1536')
    expect(calls[0].options.quality).toBe('high')
    expect(calls[0].options.outputFormat).toBe('webp')
    expect(calls[0].options.baseImage).toBe('ZmFrZV9iYXNl')
  })

  it('treats GPT Image provider aliases as the GPT Image category', async () => {
    const { calls, processAssistantImageTokens } = createHarness({
      provider: 'openrouter',
      entry: {
        basePrompt: 'blue-haired student in a navy school uniform',
        artistTags: '',
        negativePrompt: ''
      }
    })
    const contact = {
      id: 'c1',
      name: 'Alice',
      msgs: [
        {
          id: 'msg_gpt_alias',
          role: 'assistant',
          senderId: 'c1',
          senderName: 'Alice',
          content: '(image:在咖啡厅微笑)'
        }
      ]
    }

    await processAssistantImageTokens(contact, new Set())

    expect(calls).toHaveLength(1)
    expect(calls[0].prompt).toContain('blue-haired student')
    expect(calls[0].prompt).toContain('在咖啡厅微笑')
    expect(calls[0].options.strength).toBe(0.45)
  })

  it('uses Danbooru prompt composition when a compatible endpoint is serving a tag model', async () => {
    const { calls, processAssistantImageTokens } = createHarness({
      provider: 'openai_images',
      vnImageGenConfig: {
        openaiImages: {
          model: 'sdxl-pony',
          promptStyle: 'auto'
        }
      }
    })
    const contact = {
      id: 'c1',
      name: 'Alice',
      msgs: [
        {
          id: 'msg_openai_tag_model',
          role: 'assistant',
          senderId: 'c1',
          senderName: 'Alice',
          content: '(image:smile, cafe)'
        }
      ]
    }

    await processAssistantImageTokens(contact, new Set())

    expect(calls).toHaveLength(1)
    expect(calls[0].prompt).toContain('silver_hair')
    expect(calls[0].prompt).toContain('smile')
    expect(calls[0].prompt).toContain('masterpiece')
    expect(calls[0].prompt).not.toContain('blue-haired student')
  })

  it('allows manually forcing natural-language prompts for tag-like model names', async () => {
    const { calls, processAssistantImageTokens } = createHarness({
      provider: 'openai_images',
      vnImageGenConfig: {
        openaiImages: {
          model: 'sdxl-pony',
          promptStyle: 'natural'
        }
      },
      entry: {
        basePrompt: 'blue-haired student in a navy school uniform',
        artistTags: '',
        negativePrompt: ''
      }
    })
    const contact = {
      id: 'c1',
      name: 'Alice',
      msgs: [
        {
          id: 'msg_force_natural',
          role: 'assistant',
          senderId: 'c1',
          senderName: 'Alice',
          content: '(image:在咖啡厅微笑着看窗外)'
        }
      ]
    }

    await processAssistantImageTokens(contact, new Set())

    expect(calls).toHaveLength(1)
    expect(calls[0].prompt).toContain('blue-haired student')
    expect(calls[0].prompt).toContain('在咖啡厅微笑着看窗外')
    expect(calls[0].prompt).not.toContain('masterpiece')
  })

  it('normalizes raw base64 image results before inserting image messages', async () => {
    const { processAssistantImageTokens } = createHarness({
      imageResult: SAMPLE_PNG_BASE64
    })
    const contact = {
      id: 'c1',
      name: 'Alice',
      msgs: [
        {
          id: 'msg_4',
          role: 'assistant',
          senderId: 'c1',
          senderName: 'Alice',
          content: '(image:smile)'
        }
      ]
    }

    await processAssistantImageTokens(contact, new Set())

    const imageMsg = contact.msgs.find(msg => msg.isImage)
    expect(imageMsg?.imageUrl).toBe(SAMPLE_IMAGE_DATA_URL)
  })

  it('normalizes Blob image results before inserting image messages', async () => {
    const { processAssistantImageTokens } = createHarness({
      imageResult: new Blob([base64ToBytes(SAMPLE_PNG_BASE64)], { type: 'image/png' })
    })
    const contact = {
      id: 'c1',
      name: 'Alice',
      msgs: [
        {
          id: 'msg_4_blob',
          role: 'assistant',
          senderId: 'c1',
          senderName: 'Alice',
          content: '(image:smile)'
        }
      ]
    }

    await processAssistantImageTokens(contact, new Set())

    const imageMsg = contact.msgs.find(msg => msg.isImage)
    expect(imageMsg?.imageUrl).toBe(SAMPLE_IMAGE_DATA_URL)
  })

  it('shows a failure bubble when generation returns a non-image payload', async () => {
    const { processAssistantImageTokens } = createHarness({
      imageResult: '{"ok":true}'
    })
    const contact = {
      id: 'c1',
      name: 'Alice',
      msgs: [
        {
          id: 'msg_5',
          role: 'assistant',
          senderId: 'c1',
          senderName: 'Alice',
          content: '(image:smile)'
        }
      ]
    }

    await processAssistantImageTokens(contact, new Set())

    expect(contact.msgs.some(msg => msg.isImage)).toBe(false)
    expect(contact.msgs.some(msg => String(msg.content || '').includes('图片渲染失败'))).toBe(true)
  })

  it('allows rerolling a failed image bubble without truncating the whole reply', async () => {
    let attempt = 0
    const { calls, processAssistantImageTokens, rerollImageMessage, toasts } = createHarness({
      generateImage: async () => {
        attempt += 1
        if (attempt === 1) {
          throw new Error('429 Too Many Requests')
        }
        return SAMPLE_IMAGE_DATA_URL
      }
    })
    const contact = {
      id: 'c1',
      name: 'Alice',
      msgs: [
        {
          id: 'msg_reroll_failed',
          role: 'assistant',
          senderId: 'c1',
          senderName: 'Alice',
          content: '(image:smile, cafe)'
        }
      ]
    }

    await processAssistantImageTokens(contact, new Set())

    const failedMsg = contact.msgs.find(msg => String(msg.content || '').includes('图片渲染失败'))
    expect(failedMsg?.imagePrompt).toContain('silver_hair')
    expect(failedMsg?.imageSceneTags).toBe('smile, cafe')
    expect(toasts.at(-1)).toContain('429 Too Many Requests')

    const rerolled = await rerollImageMessage(contact, failedMsg?.id)

    expect(rerolled).toBe(true)
    expect(calls).toHaveLength(2)
    expect(failedMsg?.isImage).toBe(true)
    expect(failedMsg?.imageUrl).toBe(SAMPLE_IMAGE_DATA_URL)
    expect(failedMsg?.content).toBe('[图片]')
  })

  it('keeps the previous image visible when reroll fails', async () => {
    let attempt = 0
    const { calls, processAssistantImageTokens, rerollImageMessage, toasts } = createHarness({
      generateImage: async () => {
        attempt += 1
        if (attempt === 1) return SAMPLE_IMAGE_DATA_URL
        throw new Error('429 Too Many Requests')
      }
    })
    const contact = {
      id: 'c1',
      name: 'Alice',
      msgs: [
        {
          id: 'msg_keep_old',
          role: 'assistant',
          senderId: 'c1',
          senderName: 'Alice',
          content: '(image:smile)'
        }
      ]
    }

    await processAssistantImageTokens(contact, new Set())

    const imageMsg = contact.msgs.find(msg => msg.isImage)
    const originalUrl = imageMsg?.imageUrl
    const rerolled = await rerollImageMessage(contact, imageMsg?.id)

    expect(rerolled).toBe(true)
    expect(calls).toHaveLength(2)
    expect(imageMsg?.isImage).toBe(true)
    expect(imageMsg?.imageUrl).toBe(originalUrl)
    expect(imageMsg?.content).toBe('[图片]')
    expect(toasts.at(-1)).toContain('已保留原图')
  })

  it('adds every successful reroll result into the album history', async () => {
    let attempt = 0
    const { albumAdds, processAssistantImageTokens, rerollImageMessage } = createHarness({
      generateImage: async () => {
        attempt += 1
        return attempt === 1
          ? 'https://img.test/generated-1.png'
          : 'https://img.test/generated-2.png'
      }
    })
    const contact = {
      id: 'c1',
      name: 'Alice',
      msgs: [
        {
          id: 'msg_album_history',
          role: 'assistant',
          senderId: 'c1',
          senderName: 'Alice',
          content: '(image:smile)'
        }
      ]
    }

    await processAssistantImageTokens(contact, new Set())

    const imageMsg = contact.msgs.find(msg => msg.isImage)
    const rerolled = await rerollImageMessage(contact, imageMsg?.id)

    expect(rerolled).toBe(true)
    expect(albumAdds).toHaveLength(2)
    expect(albumAdds[0]?.url).toBe('https://img.test/generated-1.png')
    expect(albumAdds[1]?.url).toBe('https://img.test/generated-2.png')
    expect(imageMsg?.imageUrl).toBe('https://img.test/generated-2.png')
  })
})
