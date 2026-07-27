import { normalizeImageGenProvider } from './providers'

export const IMAGE_PROMPT_STYLE_AUTO = 'auto'
export const IMAGE_PROMPT_STYLE_DANBOORU = 'danbooru'
export const IMAGE_PROMPT_STYLE_NATURAL = 'natural'
export const IMAGE_PROMPT_STYLE_GPT_IMAGE = 'gpt_image'
export const IMAGE_PROMPT_STYLE_GEMINI_IMAGE = 'gemini_image'

const TAG_MODEL_RE = /(?:nai|novelai|danbooru|stable[-_\s]?diffusion|sdxl|pony|illustrious|animagine|anything|waifu|counterfeit|meina|pastel|dreamshaper|realvis|revanimated)/i
const GPT_IMAGE_MODEL_RE = /(?:gpt[-_\s]?image|dall[-_\s]?e|chatgpt)/i
const GEMINI_IMAGE_MODEL_RE = /(?:gemini|nano[-_\s]?banana)/i

export function normalizeImagePromptStyle(value) {
  const text = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (!text) return IMAGE_PROMPT_STYLE_AUTO
  if (text === 'tag' || text === 'tags' || text === 'danbooru' || text === 'booru') return IMAGE_PROMPT_STYLE_DANBOORU
  if (text === 'natural' || text === 'natural_language' || text === 'nl') return IMAGE_PROMPT_STYLE_NATURAL
  if (text === 'gpt' || text === 'gpt_image' || text === 'openai_image' || text === 'openai_images') return IMAGE_PROMPT_STYLE_GPT_IMAGE
  if (text === 'gemini' || text === 'gemini_image' || text === 'nanobanana' || text === 'nano_banana') return IMAGE_PROMPT_STYLE_GEMINI_IMAGE
  if (text === IMAGE_PROMPT_STYLE_AUTO) return IMAGE_PROMPT_STYLE_AUTO
  return IMAGE_PROMPT_STYLE_AUTO
}

export function getImageGenProviderConfig(imageGenConfig = {}) {
  const provider = normalizeImageGenProvider(imageGenConfig?.provider)
  if (provider === 'novelai') {
    return {
      provider,
      config: imageGenConfig?.novelai || {},
      model: String(imageGenConfig?.novelai?.model || '').trim()
    }
  }
  if (provider === 'nanobanana') {
    return {
      provider,
      config: imageGenConfig?.nanobanana || {},
      model: String(imageGenConfig?.nanobanana?.model || '').trim()
    }
  }
  if (provider === 'openai_images') {
    return {
      provider,
      config: imageGenConfig?.openaiImages || {},
      model: String(imageGenConfig?.openaiImages?.model || '').trim()
    }
  }
  if (provider === 'custom') {
    return {
      provider,
      config: imageGenConfig?.custom || {},
      model: String(imageGenConfig?.custom?.model || '').trim()
    }
  }
  return { provider, config: {}, model: '' }
}

export function resolveImagePromptStyle(imageGenConfig = {}) {
  const { provider, config, model } = getImageGenProviderConfig(imageGenConfig)
  const explicit = normalizeImagePromptStyle(config?.promptStyle || config?.prompt_style)
  if (explicit !== IMAGE_PROMPT_STYLE_AUTO) return explicit

  if (provider === 'novelai') return IMAGE_PROMPT_STYLE_DANBOORU
  if (TAG_MODEL_RE.test(model)) return IMAGE_PROMPT_STYLE_DANBOORU
  if (GEMINI_IMAGE_MODEL_RE.test(model)) return IMAGE_PROMPT_STYLE_GEMINI_IMAGE
  if (GPT_IMAGE_MODEL_RE.test(model)) return IMAGE_PROMPT_STYLE_GPT_IMAGE
  if (provider === 'nanobanana') return IMAGE_PROMPT_STYLE_GEMINI_IMAGE
  if (provider === 'openai_images') return IMAGE_PROMPT_STYLE_GPT_IMAGE
  return IMAGE_PROMPT_STYLE_NATURAL
}

export function usesTagImagePrompt(style) {
  return normalizeImagePromptStyle(style) === IMAGE_PROMPT_STYLE_DANBOORU
}

export function usesNaturalLanguageImagePrompt(style) {
  return !usesTagImagePrompt(style)
}
