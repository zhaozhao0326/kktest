/**
 * 生图结果 URL 归一化与可加载性校验（聊天 / 动态共用）。
 */

export function base64ToBytes(base64) {
  const normalized = String(base64 || '').replace(/\s+/g, '')
  if (!normalized) return new Uint8Array(0)
  try {
    const binary = atob(normalized)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  } catch {
    return new Uint8Array(0)
  }
}

export function bytesToBase64(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) return ''
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

export function detectKnownImageMimeType(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) return ''
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg'
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'image/webp'
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 &&
    bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61
  ) return 'image/gif'
  return ''
}

export async function blobToDataUrl(blob) {
  if (!blob || typeof blob.arrayBuffer !== 'function') return ''
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const mimeType = String(blob.type || '').trim() || detectKnownImageMimeType(bytes)
  if (!mimeType) return ''
  return `data:${mimeType};base64,${bytesToBase64(bytes)}`
}

export async function normalizeGeneratedImageUrl(rawValue) {
  if (typeof Blob !== 'undefined' && rawValue instanceof Blob) {
    const dataUrl = await blobToDataUrl(rawValue)
    if (!dataUrl) return ''
    rawValue = dataUrl
  }

  const text = String(rawValue || '').trim()
  if (!text) return ''
  if (/^data:image\//i.test(text) || /^(?:blob:|https?:\/\/)/i.test(text)) return text

  if (/^data:/i.test(text)) {
    const match = text.match(/^data:[^;,]*;base64,([\s\S]+)$/i)
    if (!match) return ''
    const bytes = base64ToBytes(match[1])
    const mimeType = detectKnownImageMimeType(bytes)
    if (!mimeType) return ''
    return `data:${mimeType};base64,${bytesToBase64(bytes)}`
  }

  if (/^[a-z0-9+/=\s]+$/i.test(text) && text.replace(/\s+/g, '').length >= 64) {
    const bytes = base64ToBytes(text)
    const mimeType = detectKnownImageMimeType(bytes)
    if (!mimeType) return ''
    return `data:${mimeType};base64,${bytesToBase64(bytes)}`
  }

  return ''
}

export async function ensureImageUrlLoadable(imageUrl, timeoutMs = 15000) {
  if (!imageUrl || typeof Image === 'undefined') return imageUrl
  await new Promise((resolve, reject) => {
    let settled = false
    const img = new Image()
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error('图片加载超时'))
    }, timeoutMs)

    img.onload = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve()
    }
    img.onerror = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new Error('图片加载失败'))
    }
    img.src = imageUrl
  })
  return imageUrl
}

export async function finalizeGeneratedImageUrl(rawValue) {
  const imageUrl = await normalizeGeneratedImageUrl(rawValue)
  if (!imageUrl) {
    throw new Error('图片结果无效：未返回可渲染的图片地址')
  }
  return await ensureImageUrlLoadable(imageUrl)
}
