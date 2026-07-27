import { parseImageTokenPayload } from '../../../composables/api/imageTokens'
import {
  clampNumber,
  MAX_VIBE_REFERENCES,
  normalizeCharacterRefMode,
  normalizeStrengths
} from '../../../composables/imageGen/generationPrefs'
import {
  resolveImagePromptStyle,
  usesNaturalLanguageImagePrompt
} from '../../../composables/imageGen/promptProfiles'
import { normalizeImageGenProvider } from '../../../composables/imageGen/providers'
import { finalizeGeneratedImageUrl } from '../../../composables/imageGen/resultUrl'

export function useChatImageTokens(options = {}) {
  const {
    store,
    charResStore,
    albumStore,
    generateImage,
    makeId,
    showToast,
    scrollToBottom
  } = options

  const DEFAULT_IMAGE_REQUEST_TIMEOUT_MS = 90_000
  const MIN_IMAGE_REQUEST_TIMEOUT_MS = 10_000
  const MAX_IMAGE_REQUEST_TIMEOUT_MS = 600_000

  function normalizeImageRequestTimeoutMs(value, fallback = DEFAULT_IMAGE_REQUEST_TIMEOUT_MS) {
    const n = Number(value)
    if (!Number.isFinite(n) || n <= 0) return fallback
    return Math.max(MIN_IMAGE_REQUEST_TIMEOUT_MS, Math.min(MAX_IMAGE_REQUEST_TIMEOUT_MS, Math.round(n)))
  }

  function getImageRequestTimeoutMs() {
    return normalizeImageRequestTimeoutMs(store?.vnImageGenConfig?.imageRequestTimeoutMs)
  }

  function getProvider() {
    return normalizeImageGenProvider(store?.vnImageGenConfig?.provider)
  }

  function getPromptStyle() {
    return resolveImagePromptStyle(store?.vnImageGenConfig || {})
  }

  function normalizeImageGenerationType(value) {
    return String(value || '').trim().toLowerCase() === 'scene' ? 'scene' : 'character'
  }

  function buildImageGenerationMetadata({ prompt, sceneTags, imageType, imageOptions }) {
    return {
      prompt: String(prompt || '').trim(),
      sceneTags: String(sceneTags || '').trim(),
      imageType: normalizeImageGenerationType(imageType),
      provider: getProvider(),
      options: sanitizeImagePromptOptions(imageOptions)
    }
  }

  function applyImageGenerationMetadata(message, metadata) {
    if (!message || !metadata) return
    message.generatedByAIImage = true
    message.imageSource = 'ai-generated'
    message.skipForAIContext = true
    message.imagePrompt = metadata.prompt
    message.imageSceneTags = metadata.sceneTags
    message.imageGenerationType = metadata.imageType
    message.imagePromptProvider = metadata.provider
    message.imagePromptOptions = metadata.options && Object.keys(metadata.options).length > 0
      ? { ...metadata.options }
      : undefined
  }

  function snapshotImageMessageState(message) {
    if (!message || typeof message !== 'object') return null
    return {
      content: message.content,
      isImage: message.isImage === true,
      isImageRendering: message.isImageRendering === true,
      imageUrl: message.imageUrl,
      generatedByAIImage: message.generatedByAIImage,
      imageSource: message.imageSource,
      skipForAIContext: message.skipForAIContext,
      imagePrompt: message.imagePrompt,
      imageSceneTags: message.imageSceneTags,
      imageGenerationType: message.imageGenerationType,
      imagePromptProvider: message.imagePromptProvider,
      imagePromptOptions: message.imagePromptOptions
    }
  }

  function restoreImageMessageState(message, snapshot) {
    if (!message || !snapshot) return
    Object.assign(message, snapshot)
  }

  function hasImageRerollMetadata(message) {
    if (!message || typeof message !== 'object') return false
    const prompt = String(message.imagePrompt || '').trim()
    const sceneTags = String(message.imageSceneTags || '').trim()
    return !!(prompt || sceneTags)
  }

  function setImageMessageRenderingState(message, metadata, renderingText = '正在渲染图片…') {
    if (!message) return
    applyImageGenerationMetadata(message, metadata)
    message.isImageRendering = true
    message.isImage = false
    message.content = renderingText
  }

  function setImageMessageSuccessState(message, metadata, imageUrl) {
    if (!message) return
    applyImageGenerationMetadata(message, metadata)
    message.isImageRendering = false
    message.isImage = true
    message.content = '[图片]'
    message.imageUrl = imageUrl
  }

  function setImageMessageFailureState(message, metadata, error, failurePrefix = '图片渲染失败') {
    if (!message) return
    applyImageGenerationMetadata(message, metadata)
    message.isImageRendering = false
    message.isImage = false
    message.content = `🖼️ ${failurePrefix}：${String(error?.message || '未知错误')}`
  }

  function extractImageTokenTags(text) {
    const content = String(text || '')
    const tokenRe = /(?:\(|（|\[|【)\s*(?:image|img|pic|photo|生图|画图|发图|配图|图片|图像)\s*[:：]\s*([^)）\]】]+?)\s*(?:\)|）|\]|】)/gi
    const tagsList = []
    let match
    while ((match = tokenRe.exec(content)) !== null) {
      const tags = String(match[1] || '').trim()
      if (tags) tagsList.push(tags)
    }
    return tagsList
  }

  function stripImageTokensFromText(text) {
    const content = String(text || '')
    const tokenRe = /(?:\(|（|\[|【)\s*(?:image|img|pic|photo|生图|画图|发图|配图|图片|图像)\s*[:：]\s*([^)）\]】]+?)\s*(?:\)|）|\]|】)/gi
    return content
      .replace(tokenRe, '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .join('\n')
  }

  function splitDanbooruTags(text) {
    return String(text || '')
      .split(/[,，\n]/)
      .map(tag => tag.trim().toLowerCase().replace(/\s+/g, '_'))
      .filter(Boolean)
  }

  function uniqueTags(tags) {
    const result = []
    const seen = new Set()
    tags.forEach(tag => {
      if (seen.has(tag)) return
      seen.add(tag)
      result.push(tag)
    })
    return result
  }

  function clampUnitNumber(value, fallback = 1) {
    return clampNumber(value, 0, 1, fallback)
  }

  function normalizeReferenceImage(value) {
    const text = String(value || '').trim()
    if (!text) return ''
    const normalized = text.startsWith('data:') ? (text.split(',')[1] || '') : text
    return normalized.replace(/\s+/g, '')
  }

  function buildNovelAIReferenceOptionsForMessage(entry) {
    const prefs = entry?.generationPrefs && typeof entry.generationPrefs === 'object'
      ? entry.generationPrefs
      : null
    if (!prefs) return {}

    const vibeList = Array.isArray(prefs.vibeReferences)
      ? prefs.vibeReferences
          .slice(0, MAX_VIBE_REFERENCES)
          .map(item => {
            if (!item || typeof item !== 'object') return null
            const image = normalizeReferenceImage(item.image)
            if (!image) return null
            return {
              image,
              strength: clampUnitNumber(item.strength, 0.65),
              info: clampUnitNumber(item.informationExtracted, 1)
            }
          })
          .filter(Boolean)
      : []

    // Follow official behavior: when vibe exists, character reference is not mixed in the same request.
    if (vibeList.length > 0) {
      const strengths = normalizeStrengths(vibeList.map(v => v.strength), 1)
      return {
        reference_image_multiple: vibeList.map(v => v.image),
        reference_strength_multiple: strengths,
        reference_information_extracted_multiple: vibeList.map(v => v.info),
        normalize_reference_strength_multiple: true
      }
    }

    if (!prefs.characterRefEnabled) return {}
    const image = normalizeReferenceImage(prefs.characterRefImage)
    if (!image) return {}
    const mode = normalizeCharacterRefMode(
      prefs.characterRefMode !== undefined
        ? prefs.characterRefMode
        : (prefs.characterRefStyleAware === false ? 'character_only' : 'character_style')
    )
    const fidelity = clampUnitNumber(
      prefs.characterRefFidelity !== undefined ? prefs.characterRefFidelity : prefs.characterRefInfoExtracted,
      0.5
    )
    return {
      directorReferenceMode: mode,
      directorReferenceImages: [image],
      directorReferenceInformationExtracted: [1],
      directorReferenceStrengthValues: [clampUnitNumber(prefs.characterRefStrength, 0.65)],
      // API uses "secondary strength" where 0 = max fidelity, so invert UI "fidelity".
      directorReferenceSecondaryStrengthValues: [clampUnitNumber(1 - fidelity, 0.5)]
    }
  }

  function buildImagePromptForMessage(msg, sceneTags, imageType) {
    const provider = getProvider()
    const promptStyle = getPromptStyle()
    const isCharacter = imageType === 'character'
    const contactId = msg?.senderId || store?.activeChat?.id || ''
    const entry = contactId ? charResStore?.getEntry(contactId) : null
    const keepArtistTagsOnNonCharacterImage = !!entry?.generationPrefs?.keepArtistTagsOnNonCharacterImage

    if (usesNaturalLanguageImagePrompt(promptStyle)) {
      // Natural language image models.
      const sceneText = String(sceneTags || '').trim()
      if (!isCharacter) return sceneText || 'cinematic scene, atmospheric lighting, detailed composition'
      // Character image: prepend character description for context
      const charDesc = String(entry?.basePrompt || '').trim()
      if (charDesc && sceneText) return charDesc + ', ' + sceneText
      if (charDesc) return charDesc
      if (sceneText) return sceneText
      return 'anime character portrait, upper body, soft lighting'
    }

    // NAI / default: danbooru tag composition
    const actionTags = splitDanbooruTags(sceneTags || '')
    if (!isCharacter) {
      // Non-character: scene tags + quality. Character tags are always removed.
      // Artist tags are optional via per-character generation preference.
      const artistTags = keepArtistTagsOnNonCharacterImage
        ? splitDanbooruTags(entry?.artistTags || '')
        : []
      const qualityTags = ['masterpiece', 'best_quality', 'highres']
      return uniqueTags([...artistTags, ...actionTags, ...qualityTags]).join(', ')
    }
    const artistTags = splitDanbooruTags(entry?.artistTags || '')
    const roleTags = splitDanbooruTags(entry?.basePrompt || '')
    const qualityTags = ['masterpiece', 'best_quality', 'highres', 'anime_style']
    return uniqueTags([...artistTags, ...roleTags, ...actionTags, ...qualityTags]).join(', ')
  }

  function assignOptionIfSet(target, key, value) {
    if (value === undefined || value === null || value === '') return
    target[key] = value
  }

  function sanitizeImagePromptOptions(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    const allowed = [
      'size',
      'width',
      'height',
      'aspectRatio',
      'quality',
      'outputFormat',
      'background'
    ]
    return allowed.reduce((acc, key) => {
      const raw = value[key]
      if (raw === undefined || raw === null || raw === '') return acc
      acc[key] = String(raw).trim()
      return acc
    }, {})
  }

  function normalizeGenDimension(value, fallback = null) {
    const n = Number(value)
    if (!Number.isFinite(n) || n <= 0) return fallback
    return Math.max(64, Math.min(4096, Math.round(n)))
  }

  function normalizeTokenSize(value) {
    const text = String(value || '').trim().toLowerCase()
    if (!text) return ''
    const aliases = {
      square: '1024x1024',
      portrait: '1024x1536',
      vertical: '1024x1536',
      tall: '1024x1536',
      landscape: '1536x1024',
      horizontal: '1536x1024',
      wide: '1536x1024'
    }
    return aliases[text] || text
  }

  function applyTokenImageOptions(target, rawOptions = {}) {
    const imageOptions = sanitizeImagePromptOptions(rawOptions)
    if (imageOptions.size) {
      target.size = normalizeTokenSize(imageOptions.size)
      target.openaiSize = target.size
    }
    const width = normalizeGenDimension(imageOptions.width)
    const height = normalizeGenDimension(imageOptions.height)
    if (width) target.width = width
    if (height) target.height = height
    assignOptionIfSet(target, 'aspectRatio', imageOptions.aspectRatio)
    assignOptionIfSet(target, 'quality', imageOptions.quality)
    assignOptionIfSet(target, 'outputFormat', imageOptions.outputFormat)
    assignOptionIfSet(target, 'background', imageOptions.background)
    return imageOptions
  }

  function getImageGenOptionsForMessage(msg, imageType, imageOptions = {}) {
    const contactId = msg?.senderId || store?.activeChat?.id || ''
    const entry = contactId ? charResStore?.getEntry(contactId) : null
    const provider = getProvider()
    const isCharacter = imageType === 'character'
    const naiCfg = store?.vnImageGenConfig?.novelai || {}
    const cfgWidth = normalizeGenDimension(naiCfg.width)
    const cfgHeight = normalizeGenDimension(naiCfg.height)
    const entryWidth = normalizeGenDimension(entry?.baseImage?.params?.width)
    const entryHeight = normalizeGenDimension(entry?.baseImage?.params?.height)
    const hasCfgSize = !!cfgWidth && !!cfgHeight
    const hasEntrySize = !!entryWidth && !!entryHeight
    const isLikelyDefaultSquare = cfgWidth === 1024 && cfgHeight === 1024
    const useEntrySize = hasEntrySize && (!hasCfgSize || isLikelyDefaultSquare)
    const fallbackWidth = 832
    const fallbackHeight = 1216

    const width = useEntrySize
      ? entryWidth
      : (cfgWidth || entryWidth || fallbackWidth)
    const height = useEntrySize
      ? entryHeight
      : (cfgHeight || entryHeight || fallbackHeight)

    const options = { width, height }

    if (provider === 'novelai') {
      const passthroughKeys = [
        'model',
        'sampler',
        'steps',
        'scale',
        'qualityToggle',
        'sm',
        'sm_dyn',
        'ucPreset',
        'cfg_rescale',
        'uncond_scale',
        'strength',
        'noise',
        'noise_schedule',
        'params_version'
      ]
      passthroughKeys.forEach(key => assignOptionIfSet(options, key, naiCfg[key]))
      assignOptionIfSet(options, 'negative_prompt', naiCfg.negative_prompt)
      if (isCharacter) {
        Object.assign(options, buildNovelAIReferenceOptionsForMessage(entry))
      }
    } else if ((provider === 'nanobanana' || provider === 'openai_images') && isCharacter) {
      // Auto-attach base sprite as reference image for character consistency
      const baseUrl = entry?.baseImage?.url
      if (baseUrl) {
        const base64 = extractBase64FromDataUrl(baseUrl)
        if (base64) {
          options.baseImage = base64
          options.strength = provider === 'openai_images' ? 0.45 : 0.55
        }
      }
    }

    applyTokenImageOptions(options, imageOptions)

    const roleNegativePrompt = String(entry?.negativePrompt || '').trim()
    if (roleNegativePrompt) {
      // Keep provider/default negative prompt and append role-specific constraints.
      options.negativePromptAppend = roleNegativePrompt
    }
    return options
  }

  function buildImageRequest(msg, { prompt, sceneTags, imageType, imageOptions }) {
    const normalizedPrompt = String(prompt || '').trim()
    const normalizedSceneTags = String(sceneTags || '').trim()
    const normalizedType = normalizeImageGenerationType(imageType)
    const normalizedOptions = sanitizeImagePromptOptions(imageOptions)
    return {
      prompt: normalizedPrompt,
      metadata: buildImageGenerationMetadata({
        prompt: normalizedPrompt,
        sceneTags: normalizedSceneTags,
        imageType: normalizedType,
        imageOptions: normalizedOptions
      }),
      options: {
        ...getImageGenOptionsForMessage(msg, normalizedType, normalizedOptions),
        timeoutMs: getImageRequestTimeoutMs()
      }
    }
  }

  function buildImageRequestForTokenMessage(msg, rawTags) {
    const { type: imageType, tags: sceneTags, options: imageOptions } = parseImageTokenPayload(rawTags)
    return buildImageRequest(msg, {
      prompt: buildImagePromptForMessage(msg, sceneTags, imageType),
      sceneTags,
      imageType,
      imageOptions
    })
  }

  function buildImageRequestForStoredMessage(msg) {
    if (!hasImageRerollMetadata(msg)) return null
    const sceneTags = String(msg?.imageSceneTags || '').trim()
    const imageType = normalizeImageGenerationType(msg?.imageGenerationType)
    const storedPrompt = String(msg?.imagePrompt || '').trim()
    const storedProvider = String(msg?.imagePromptProvider || '').trim().toLowerCase()
    const currentProvider = getProvider()

    let prompt = ''
    if (storedPrompt && storedProvider && currentProvider && storedProvider === currentProvider) {
      prompt = storedPrompt
    }
    if (!prompt && sceneTags) {
      prompt = buildImagePromptForMessage(msg, sceneTags, imageType)
    }
    if (!prompt && storedPrompt) {
      prompt = storedPrompt
    }

    return buildImageRequest(msg, {
      prompt,
      sceneTags,
      imageType,
      imageOptions: msg?.imagePromptOptions || {}
    })
  }

  function extractBase64FromDataUrl(url) {
    const text = String(url || '').trim()
    if (!text) return ''
    if (!text.startsWith('data:')) return ''
    const idx = text.indexOf(',')
    if (idx === -1) return ''
    return text.slice(idx + 1).replace(/\s+/g, '')
  }

  async function renderImageMessage(contact, message, request, options = {}) {
    const {
      renderingText = '正在渲染图片…',
      failurePrefix = '图片渲染失败',
      preserveOnFailure = false,
      scrollOnStateChange = false
    } = options

    if (!message || !request?.prompt) {
      return {
        ok: false,
        error: new Error('图片提示词为空，已跳过本次生图')
      }
    }

    const snapshot = preserveOnFailure ? snapshotImageMessageState(message) : null
    setImageMessageRenderingState(message, request.metadata, renderingText)

    if (scrollOnStateChange) {
      scrollToBottom?.()
    }

    try {
      const imageUrl = await finalizeGeneratedImageUrl(await generateImage(request.prompt, request.options))
      setImageMessageSuccessState(message, request.metadata, imageUrl)
      albumStore?.addPhoto?.({
        url: imageUrl,
        contactId: contact?.id,
        contactName: contact?.name,
        contactAvatar: contact?.avatar || null,
        source: 'ai',
        prompt: request.prompt
      })
      return { ok: true, imageUrl }
    } catch (error) {
      console.error('[chat-image] render failed', {
        contactId: contact?.id || null,
        prompt: request.prompt,
        error
      })

      if (snapshot?.isImage && snapshot.imageUrl) {
        restoreImageMessageState(message, snapshot)
      } else {
        setImageMessageFailureState(message, request.metadata, error, failurePrefix)
      }

      return { ok: false, error }
    } finally {
      if (scrollOnStateChange) {
        scrollToBottom?.()
      }
    }
  }

  async function rerollImageMessage(contact, messageId) {
    if (!contact || !Array.isArray(contact.msgs) || !messageId) return false

    const message = contact.msgs.find(msg => msg?.id === messageId)
    if (!message || message.role !== 'assistant') return false

    if (message.isImageRendering) {
      showToast?.('这张图片还在渲染中')
      return true
    }

    const request = buildImageRequestForStoredMessage(message)
    if (!request?.prompt) return false

    const hadVisibleImage = message.isImage === true && !!String(message.imageUrl || '').trim()
    const result = await renderImageMessage(contact, message, request, {
      renderingText: hadVisibleImage ? '正在重roll图片…' : '正在重试生图…',
      failurePrefix: hadVisibleImage ? '图片重roll失败' : '图片重试失败',
      preserveOnFailure: hadVisibleImage,
      scrollOnStateChange: false
    })

    if (!result.ok) {
      if (hadVisibleImage) {
        showToast?.(
          `图片重roll失败：${String(result.error?.message || '未知错误')}，已保留原图`
        )
      } else {
        showToast?.(
          result.error?.message ? ('图片重试失败：' + result.error.message) : '图片重试失败'
        )
      }
    }

    return true
  }

  async function processAssistantImageTokens(contact, previousMsgIds) {
    if (!store?.allowAIImageGeneration) return
    if (!contact || !Array.isArray(contact.msgs) || contact.msgs.length === 0) return

    const newAssistantMessages = contact.msgs.filter(msg => {
      if (!msg || msg.role !== 'assistant') return false
      if (msg.isImage || msg.hidden || msg.hideInChat) return false
      if (previousMsgIds && previousMsgIds.has(msg.id)) return false
      return true
    })

    for (const msg of newAssistantMessages) {
      const sourceText = String(msg.content || msg.displayContent || '')
      if (!sourceText) continue

      const tagsList = extractImageTokenTags(sourceText)
      if (tagsList.length === 0) continue

      const cleanedText = stripImageTokensFromText(sourceText)
      if (cleanedText) {
        msg.content = cleanedText
        if (msg.displayContent != null) msg.displayContent = cleanedText
        msg.hideInChat = false
      } else {
        msg.hideInChat = true
      }

      let successCount = 0
      let failCount = 0
      let queuedCount = 0
      let firstError = null

      for (const rawTags of tagsList) {
        const request = buildImageRequestForTokenMessage(msg, rawTags)
        if (!request?.prompt) {
          failCount += 1
          if (!firstError) firstError = new Error('图片提示词为空，已跳过本次生图')
          continue
        }

        const renderingMsg = {
          id: makeId('msg'),
          role: 'assistant',
          senderId: msg.senderId || null,
          senderName: msg.senderName || null,
          content: '正在渲染图片…',
          time: Date.now(),
          isImageRendering: true,
          skipForAIContext: true
        }
        contact.msgs.push(renderingMsg)
        queuedCount += 1
        // Use the reactive array item for subsequent updates; mutating the raw object
        // may skip Vue change notification in some cases.
        const renderingMsgRef = contact.msgs[contact.msgs.length - 1] || renderingMsg
        const result = await renderImageMessage(contact, renderingMsgRef, request, {
          renderingText: '正在渲染图片…',
          failurePrefix: '图片渲染失败',
          scrollOnStateChange: true
        })

        if (result.ok) {
          successCount += 1
        } else {
          if (!firstError) firstError = result.error
          failCount += 1
        }
      }

      if (!cleanedText) {
        const idx = contact.msgs.findIndex(x => x?.id === msg.id)
        if (idx !== -1 && (successCount > 0 || failCount > 0 || queuedCount > 0)) {
          contact.msgs.splice(idx, 1)
        } else if (idx !== -1) {
          msg.hideInChat = false
        }
      }

      if (firstError) {
        showToast?.(firstError?.message ? ('图片渲染失败：' + firstError.message) : '图片渲染失败')
      }
    }
  }

  return {
    processAssistantImageTokens,
    rerollImageMessage
  }
}
