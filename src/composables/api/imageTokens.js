const completeTokenRe = /(?:\(|（|\[|【)\s*(?:image|img|pic|photo|生图|画图|发图|配图|图片|图像)\s*[:：]\s*([^)）\]】]+?)\s*(?:\)|）|\]|】)/gi
const incompleteTailTokenRe = /(?:\(|（|\[|【)\s*(?:image|img|pic|photo|生图|画图|发图|配图|图片|图像)\s*[:：][^)\]）】\n\r]*$/gi
const completeTokenTestRe = /(?:\(|（|\[|【)\s*(?:image|img|pic|photo|生图|画图|发图|配图|图片|图像)\s*[:：]\s*([^)）\]】]+?)\s*(?:\)|）|\]|】)/i
const IMAGE_TOKEN_PLACEHOLDER = '[图片生成中]'

export function stripImageTokensForDisplay(text, allowAIImageGeneration) {
  const content = String(text ?? '')
  if (!allowAIImageGeneration) return content
  const stripped = content
    .replace(completeTokenRe, '')
    .replace(incompleteTailTokenRe, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')

  if (!stripped.trim() && completeTokenTestRe.test(content)) {
    return IMAGE_TOKEN_PLACEHOLDER
  }

  return stripped
}

export function hasImageToken(text, allowAIImageGeneration) {
  if (!allowAIImageGeneration) return false
  const content = String(text ?? '')
  if (!content) return false
  return completeTokenTestRe.test(content)
}

const optionKeyMap = {
  type: 'type',
  kind: 'type',
  size: 'size',
  image_size: 'size',
  imagesize: 'size',
  openai_size: 'size',
  width: 'width',
  w: 'width',
  height: 'height',
  h: 'height',
  ratio: 'aspectRatio',
  aspect: 'aspectRatio',
  aspectratio: 'aspectRatio',
  aspect_ratio: 'aspectRatio',
  ar: 'aspectRatio',
  quality: 'quality',
  q: 'quality',
  format: 'outputFormat',
  output_format: 'outputFormat',
  outputformat: 'outputFormat',
  background: 'background',
  bg: 'background'
}

function normalizeOptionKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

function splitTokenPayload(text) {
  return String(text || '')
    .split(/[,，;；]/)
    .map(part => part.trim())
    .filter(Boolean)
}

function parseTokenOption(part) {
  const m = String(part || '').match(/^([a-zA-Z_][\w -]*)\s*[=＝:：]\s*(.+)$/)
  if (!m) return null
  const key = optionKeyMap[normalizeOptionKey(m[1])]
  if (!key) return null
  const value = String(m[2] || '').trim()
  if (!value) return null
  return { key, value }
}

export function parseImageTokenPayload(rawTags) {
  let text = String(rawTags || '').trim()
  if (!text) return { type: 'character', tags: '', options: {} }

  const options = {}
  const tags = []
  const typePrefix = text.match(/^\s*type\s*[=＝]\s*([a-z0-9_-]+)\s*(?:[,，;；]\s*)?/i)
  if (typePrefix) {
    options.type = typePrefix[1].toLowerCase()
    text = text.slice(typePrefix[0].length).trim()
  }

  for (const part of splitTokenPayload(text)) {
    const option = parseTokenOption(part)
    if (!option) {
      tags.push(part)
      continue
    }
    if (option.key === 'type') {
      options.type = option.value.toLowerCase()
    } else {
      options[option.key] = option.value
    }
  }

  if (tags.length === 0) {
    const typeOnly = text.match(/^\s*type\s*[=＝]\s*([a-z0-9_-]+)\s*$/i)
    if (typeOnly) options.type = typeOnly[1].toLowerCase()
  }

  return {
    type: options.type || 'character',
    tags: tags.join(', '),
    options
  }
}
