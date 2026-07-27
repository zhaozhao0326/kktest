export const IMAGE_GEN_PROVIDER_NOVELAI = 'novelai'
export const IMAGE_GEN_PROVIDER_NANOBANANA = 'nanobanana'
export const IMAGE_GEN_PROVIDER_OPENAI_IMAGES = 'openai_images'
export const IMAGE_GEN_PROVIDER_CUSTOM = 'custom'

function normalizeProviderText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

export function normalizeImageGenProvider(value, fallback = '') {
  const text = normalizeProviderText(value)
  if (!text) return fallback

  if (text === 'novelai' || text === 'novel_ai' || text === 'nai') {
    return IMAGE_GEN_PROVIDER_NOVELAI
  }

  if (
    text === 'nanobanana' ||
    text === 'nano_banana' ||
    text === 'gemini' ||
    text === 'gemini_image' ||
    text === 'google_gemini'
  ) {
    return IMAGE_GEN_PROVIDER_NANOBANANA
  }

  if (
    text === 'openai' ||
    text === 'openai_image' ||
    text === 'openai_images' ||
    text === 'gpt_image' ||
    text === 'gpt_images' ||
    text === 'gpt_image2' ||
    text === 'gptimage' ||
    text === 'gptimage2' ||
    text === 'dalle' ||
    text === 'dall_e' ||
    text === 'image' ||
    text === 'images' ||
    text === 'openrouter' ||
    text === 'open_router' ||
    /(?:^|[/_])gpt_?image/.test(text)
  ) {
    return IMAGE_GEN_PROVIDER_OPENAI_IMAGES
  }

  if (text === 'custom' || text === 'custom_api') {
    return IMAGE_GEN_PROVIDER_CUSTOM
  }

  return text
}

export function isNaturalImageGenProvider(value) {
  const provider = normalizeImageGenProvider(value)
  return provider === IMAGE_GEN_PROVIDER_NANOBANANA || provider === IMAGE_GEN_PROVIDER_OPENAI_IMAGES
}
