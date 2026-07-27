/**
 * 动态/朋友圈配图生成助手。
 * 供 moments store（AI 标记生图）、发帖 composer（手动 AI 生图）共用。
 */
import { useSettingsStore } from '../../stores/settings'
import { useVNStore } from '../../stores/vn'
import { useCharacterResourcesStore } from '../../stores/characterResources'
import { useAlbumStore } from '../../stores/album'
import { useImageGen } from '../useImageGen'
import { finalizeGeneratedImageUrl } from './resultUrl'
import { resolveImagePromptStyle, usesNaturalLanguageImagePrompt } from './promptProfiles'
import { normalizeImageGenProvider } from './providers'

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

function isCharacterLikeTags(tags) {
  return /selfie|自拍|portrait|1girl|1boy|solo/i.test(String(tags || ''))
}

export function buildMomentImagePrompt(contactId, tags) {
  const vnStore = useVNStore()
  const charResStore = useCharacterResourcesStore()
  const promptStyle = resolveImagePromptStyle(vnStore.imageGenConfig || {})
  const entry = contactId ? charResStore.getEntry(contactId) : null
  const isCharacter = isCharacterLikeTags(tags)

  if (usesNaturalLanguageImagePrompt(promptStyle)) {
    const sceneText = String(tags || '').trim()
    if (!isCharacter) return sceneText || 'a casual daily-life photo, natural lighting'
    const charDesc = String(entry?.basePrompt || '').trim()
    if (charDesc && sceneText) return charDesc + ', ' + sceneText
    return charDesc || sceneText || 'anime character selfie, casual, soft lighting'
  }

  const actionTags = splitDanbooruTags(tags)
  const qualityTags = ['masterpiece', 'best_quality', 'highres']
  if (!isCharacter) {
    const keepArtist = !!entry?.generationPrefs?.keepArtistTagsOnNonCharacterImage
    const artistTags = keepArtist ? splitDanbooruTags(entry?.artistTags || '') : []
    return uniqueTags([...artistTags, ...actionTags, ...qualityTags]).join(', ')
  }
  const artistTags = splitDanbooruTags(entry?.artistTags || '')
  const roleTags = splitDanbooruTags(entry?.basePrompt || '')
  return uniqueTags([...artistTags, ...roleTags, ...actionTags, ...qualityTags, 'anime_style']).join(', ')
}

function buildMomentImageOptions(contactId) {
  const vnStore = useVNStore()
  const charResStore = useCharacterResourcesStore()
  const cfg = vnStore.imageGenConfig || {}
  const provider = normalizeImageGenProvider(cfg.provider)
  const naiCfg = cfg.novelai || {}
  const options = {
    width: Number(naiCfg.width) > 0 ? Number(naiCfg.width) : 832,
    height: Number(naiCfg.height) > 0 ? Number(naiCfg.height) : 1216
  }
  if (provider === 'novelai') {
    const passthroughKeys = ['model', 'sampler', 'steps', 'scale', 'qualityToggle', 'ucPreset', 'cfg_rescale', 'noise_schedule']
    passthroughKeys.forEach(key => {
      const value = naiCfg[key]
      if (value !== undefined && value !== null && value !== '') options[key] = value
    })
    if (naiCfg.negative_prompt) options.negative_prompt = naiCfg.negative_prompt
  }
  const entry = contactId ? charResStore.getEntry(contactId) : null
  const roleNegative = String(entry?.negativePrompt || '').trim()
  if (roleNegative) options.negativePromptAppend = roleNegative
  return options
}

/**
 * 生成一张动态配图，返回可渲染 URL。失败时抛错。
 * @param {{ contactId?: string, tags: string, saveToAlbum?: boolean, contactName?: string, contactAvatar?: string }} params
 */
export async function generateMomentImage({ contactId = '', tags = '', saveToAlbum = true, contactName = '', contactAvatar = null }) {
  const prompt = buildMomentImagePrompt(contactId, tags)
  if (!prompt) throw new Error('图片提示词为空')
  const { generateImage } = useImageGen()
  const options = buildMomentImageOptions(contactId)
  const imageUrl = await finalizeGeneratedImageUrl(await generateImage(prompt, options))

  if (saveToAlbum) {
    try {
      const albumStore = useAlbumStore()
      albumStore.addPhoto?.({
        url: imageUrl,
        contactId: contactId || null,
        contactName: contactName || null,
        contactAvatar: contactAvatar || null,
        source: 'ai',
        prompt
      })
    } catch { /* album optional */ }
  }
  return { url: imageUrl, prompt }
}

/**
 * 为动态/评论对象异步生成配图并写回其 images 数组。
 * 调用前应已将 target.imageGenPending 计入待生成数量。
 */
export async function generateMomentImageInto(target, tags, authorId = '') {
  try {
    const settingsStore = useSettingsStore()
    if (!settingsStore.allowAIImageGeneration) return
    const { url } = await generateMomentImage({ contactId: authorId, tags })
    if (!Array.isArray(target.images)) target.images = []
    target.images.push(url)
  } catch (error) {
    console.warn('[moments-image] generate failed', error)
  } finally {
    target.imageGenPending = Math.max(0, (target.imageGenPending || 0) - 1)
  }
}
