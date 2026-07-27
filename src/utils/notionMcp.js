export const MANAGED_NOTION_SERVER_ID = 'managed_notion'
export const MANAGED_NOTION_SERVER_NAME = 'Notion'
export const NOTION_API_ENDPOINT = '/api/notion'

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function consumeQueryFeedback(keys, currentUrl = '') {
  const source = normalizeText(currentUrl)
    || (typeof window !== 'undefined' ? String(window.location.href || '') : '')
  if (!source) return {}

  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'https://example.com'
    const url = new URL(source, base)
    const payload = {}

    keys.forEach((key) => {
      const value = normalizeText(url.searchParams.get(key))
      if (value) {
        payload[key] = value
        url.searchParams.delete(key)
      }
    })

    if (Object.keys(payload).length > 0 && typeof window !== 'undefined') {
      const nextLocation = `${url.pathname}${url.search}${url.hash}`
      window.history.replaceState({}, '', nextLocation)
    }

    return payload
  } catch {
    return {}
  }
}

export function buildNotionApiUrl(action = 'status') {
  const search = new URLSearchParams()
  search.set('action', normalizeText(action) || 'status')
  return `${NOTION_API_ENDPOINT}?${search.toString()}`
}

export function mapNotionConnectErrorCode(code = '') {
  const normalized = normalizeText(code)
  const messages = {
    access_session_required: '需要先登录账号，服务器才能区分每个用户的 Notion 连接',
    encryption_unavailable: 'Notion 连接加密密钥未配置，暂时无法启用',
    storage_unavailable: 'Notion 连接存储未配置，暂时无法启用',
    oauth_denied: '你取消了 Notion 授权',
    oauth_failed: 'Notion 授权失败，请重试',
    state_mismatch: '这次 Notion 授权已失效，请重新发起',
    reauth_required: 'Notion 授权已失效，需要重新连接',
    not_connected: '当前账号还没有连接 Notion',
    unsupported: '当前环境暂不支持按用户连接 Notion',
    service_unavailable: 'Notion 连接服务暂不可用，请稍后重试'
  }
  return messages[normalized] || 'Notion 连接失败，请重试'
}

export function consumeNotionConnectFeedback(currentUrl = '') {
  const payload = consumeQueryFeedback(['notion_status', 'notion_error'], currentUrl)
  return {
    status: normalizeText(payload.notion_status),
    error: normalizeText(payload.notion_error)
  }
}
