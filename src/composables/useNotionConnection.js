import { ref } from 'vue'
import {
  buildNotionApiUrl,
  consumeNotionConnectFeedback,
  MANAGED_NOTION_SERVER_ID,
  mapNotionConnectErrorCode
} from '../utils/notionMcp'

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function createEmptyStatus() {
  return {
    supported: false,
    connected: false,
    requiresAuth: false,
    needsReconnect: false,
    reason: '',
    connection: null,
    server: null
  }
}

function getCurrentReturnTo() {
  if (typeof window === 'undefined') return '#/settings/ai'
  const hash = String(window.location.hash || '').trim()
  return hash.startsWith('#/') ? hash : '#/settings/ai'
}

function detectProblematicNotionAuthBrowser() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return ''

  try {
    const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches
      || !!window.navigator?.standalone
    if (standalone) {
      return '桌面快捷方式'
    }
  } catch {
    // ignore display-mode detection failures
  }

  const ua = String(navigator.userAgent || '').toLowerCase()
  if (!ua) return ''

  if (ua.includes('micromessenger')) return '微信内置浏览器'
  if (ua.includes(' qq/') || ua.includes('qq/')) return 'QQ内置浏览器'
  if (ua.includes('weibo')) return '微博内置浏览器'
  if (ua.includes('discord')) return 'Discord内置浏览器'
  if (ua.includes('feishu') || ua.includes('lark')) return '飞书内置浏览器'
  if (ua.includes('dingtalk')) return '钉钉内置浏览器'
  if (ua.includes('bytedancewebview') || ua.includes('aweme')) return '抖音内置浏览器'

  const isIos = /iphone|ipad|ipod/.test(ua)
  const isIosWebView = isIos && ua.includes('applewebkit') && !ua.includes('safari')
  if (isIosWebView) return 'iOS内置浏览器'

  if (ua.includes('; wv')) return 'Android内置浏览器'

  return ''
}

async function readJsonSafe(response) {
  try {
    return await response.json()
  } catch {
    return {}
  }
}

export function useNotionConnection({ showToast, refreshDirectTools, settingsStore } = {}) {
  const status = ref(createEmptyStatus())
  const busy = ref(false)
  const toolsBusy = ref(false)
  const toolsChecked = ref(false)
  const toolsError = ref('')
  const toolsCount = ref(0)
  const toolNames = ref([])
  let feedbackConsumed = false

  function consumeFeedbackOnce() {
    if (feedbackConsumed) return
    feedbackConsumed = true
    const feedback = consumeNotionConnectFeedback()
    if (feedback.error && typeof showToast === 'function') {
      showToast(mapNotionConnectErrorCode(feedback.error), 2800)
      return
    }
    if (feedback.status === 'connected' && typeof showToast === 'function') {
      showToast('Notion 已连接', 2200)
    }
  }

  async function refreshStatus({ silent = false } = {}) {
    consumeFeedbackOnce()
    busy.value = true
    try {
      const res = await fetch(buildNotionApiUrl('status'), {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          Accept: 'application/json'
        }
      })
      const payload = await readJsonSafe(res)
      status.value = {
        supported: !!payload.supported,
        connected: !!payload.connected,
        requiresAuth: !!payload.requiresAuth,
        needsReconnect: !!payload.needsReconnect,
        reason: normalizeText(payload.reason),
        connection: payload.connection && typeof payload.connection === 'object'
          ? { ...payload.connection }
          : null,
        server: payload.server && typeof payload.server === 'object'
          ? { ...payload.server }
          : null
      }

      if (!silent && status.value.reason && typeof showToast === 'function') {
        showToast(mapNotionConnectErrorCode(status.value.reason), 2600)
      }

      if (!status.value.connected) {
        toolsChecked.value = false
        toolsError.value = ''
        toolsCount.value = 0
        toolNames.value = []
      } else if (
        settingsStore?.toolCallingConfig?.notionEnabled === true
        && !toolsBusy.value
        && !toolsChecked.value
        && typeof refreshDirectTools === 'function'
      ) {
        void testTools({ silent: true })
      }

      return status.value
    } catch {
      status.value = createEmptyStatus()
      toolsChecked.value = false
      toolsError.value = ''
      if (!silent && typeof showToast === 'function') {
        showToast('Notion 状态读取失败', 2600)
      }
      return status.value
    } finally {
      busy.value = false
    }
  }

  function beginConnect() {
    if (typeof window === 'undefined') return
    const browserName = detectProblematicNotionAuthBrowser()
    if (browserName) {
      if (typeof showToast === 'function') {
        showToast(`${browserName} 容易导致 Notion 授权失败，请改用 Safari 或 Chrome 打开本站后再连接`, 4200)
      }
      return
    }
    const params = new URLSearchParams({
      action: 'start',
      returnTo: getCurrentReturnTo()
    })
    window.location.assign(`/api/notion?${params.toString()}`)
  }

  async function disconnect() {
    busy.value = true
    try {
      const res = await fetch(buildNotionApiUrl('disconnect'), {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store'
      })
      const payload = await readJsonSafe(res)
      if (!res.ok || payload.ok === false) {
        throw new Error(payload.error || `disconnect_${res.status}`)
      }

      status.value = createEmptyStatus()
      toolsChecked.value = false
      toolsError.value = ''
      toolsCount.value = 0
      toolNames.value = []
      if (typeof showToast === 'function') {
        showToast('已断开 Notion', 2200)
      }
      return true
    } catch (error) {
      if (typeof showToast === 'function') {
        showToast(mapNotionConnectErrorCode(error?.message), 2800)
      }
      return false
    } finally {
      busy.value = false
      await refreshStatus({ silent: true })
    }
  }

  async function testTools(options = {}) {
    const silent = !!options.silent
    if (settingsStore?.toolCallingConfig?.notionEnabled !== true) {
      if (!silent && typeof showToast === 'function') {
        showToast('请先开启 Notion 工具', 2200)
      }
      return null
    }
    if (typeof refreshDirectTools !== 'function') return null

    toolsBusy.value = true
    toolsError.value = ''
    try {
      const discovery = await refreshDirectTools({ force: true, serverIds: [MANAGED_NOTION_SERVER_ID] })
      const nextTools = Array.isArray(discovery?.tools) ? discovery.tools : []
      toolsChecked.value = true
      toolsCount.value = nextTools.length
      toolNames.value = nextTools.map((tool) => normalizeText(tool?.name)).filter(Boolean)
      if (toolsCount.value === 0) {
        toolsError.value = 'Notion 已连接，但当前 MCP tools/list 返回空列表。'
      }
      if (!silent && typeof showToast === 'function') {
        showToast(
          toolsCount.value > 0
            ? `连接成功，发现 ${toolsCount.value} 个工具`
            : 'Notion 已连接，但当前没有返回可用工具',
          2200
        )
      }
      return {
        toolsCount: toolsCount.value,
        toolNames: [...toolNames.value]
      }
    } catch (error) {
      toolsChecked.value = true
      toolsCount.value = 0
      toolNames.value = []
      toolsError.value = normalizeText(error?.message) || 'Notion 工具检测失败'
      if (!silent && typeof showToast === 'function') {
        showToast(toolsError.value, 2800)
      }
      return null
    } finally {
      toolsBusy.value = false
    }
  }

  return {
    notionStatus: status,
    notionBusy: busy,
    notionToolsBusy: toolsBusy,
    notionToolsChecked: toolsChecked,
    notionToolsError: toolsError,
    notionToolsCount: toolsCount,
    notionToolNames: toolNames,
    refreshNotionStatus: refreshStatus,
    beginNotionConnect: beginConnect,
    disconnectNotion: disconnect,
    testNotionTools: testTools
  }
}
