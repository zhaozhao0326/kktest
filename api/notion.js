import { getRequestQueryValue, verifyAccessRequestStrict } from '../src/utils/accessControlServer.js'
import {
  buildNotionRedirectToApp,
  completeNotionAuthorization,
  createClearedNotionStateCookie,
  disconnectNotionConnection,
  proxyNotionMcpRequest,
  readNotionConnectionStatus,
  readNotionMcpEnv,
  readNotionStateFromCookieHeader,
  startNotionAuthorization
} from '../src/utils/notionMcpServer.js'

function redirect(res, location, cookies = []) {
  if (cookies.length > 0) {
    res.setHeader('Set-Cookie', cookies)
  }
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Location', location)
  return res.status(302).end()
}

function sendJson(res, status, payload) {
  res.setHeader('Cache-Control', 'no-store')
  return res.status(status).json(payload)
}

function resolveAction(req) {
  return String(getRequestQueryValue(req, 'action') || 'status').trim().toLowerCase()
}

function mapNotionErrorCode(code = '') {
  const normalized = String(code || '').trim()
  if (normalized === 'access_denied') return 'oauth_denied'
  if (normalized === 'state_mismatch') return 'state_mismatch'
  if (normalized === 'access_session_required') return 'access_session_required'
  if (normalized === 'storage_unavailable') return 'storage_unavailable'
  if (normalized === 'encryption_unavailable') return 'encryption_unavailable'
  if (normalized === 'reauth_required') return 'reauth_required'
  if (normalized === 'not_connected') return 'not_connected'
  return normalized || 'oauth_failed'
}

export default async function handler(req, res) {
  const action = resolveAction(req)
  const env = readNotionMcpEnv()

  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET, POST, OPTIONS')
    return res.status(204).end()
  }

  if (action === 'status') {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET, OPTIONS')
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
    }

    const access = await verifyAccessRequestStrict(req)
    const payload = await readNotionConnectionStatus(env, access.ok ? access.session : null)
    return sendJson(res, 200, payload)
  }

  if (action === 'start') {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET, OPTIONS')
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
    }

    const access = await verifyAccessRequestStrict(req)
    const returnTo = String(getRequestQueryValue(req, 'returnTo') || '#/').trim() || '#/'
    if (!access.ok || !access.session) {
      return redirect(res, buildNotionRedirectToApp(req, returnTo, {
        notion_error: 'access_session_required'
      }))
    }

    try {
      const { authorizationUrl, stateCookie } = await startNotionAuthorization(req, env, access.session, returnTo)
      return redirect(res, authorizationUrl, [stateCookie])
    } catch (error) {
      return redirect(res, buildNotionRedirectToApp(req, returnTo, {
        notion_error: mapNotionErrorCode(error?.code || error?.message)
      }))
    }
  }

  if (action === 'callback') {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET, OPTIONS')
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
    }

    const clearCookie = createClearedNotionStateCookie(req)
    const access = await verifyAccessRequestStrict(req)
    const statePayload = readNotionStateFromCookieHeader(String(req.headers.cookie || ''), env.cookieSecret)
    const returnTo = statePayload?.returnTo || '#/'

    if (!access.ok || !access.session) {
      return redirect(res, buildNotionRedirectToApp(req, returnTo, {
        notion_error: 'access_session_required'
      }), [clearCookie])
    }

    const callbackError = String(getRequestQueryValue(req, 'error') || '').trim()
    if (callbackError) {
      return redirect(res, buildNotionRedirectToApp(req, returnTo, {
        notion_error: mapNotionErrorCode(callbackError)
      }), [clearCookie])
    }

    const returnedState = String(getRequestQueryValue(req, 'state') || '').trim()
    if (!statePayload || !returnedState || returnedState !== String(statePayload.state || '').trim()) {
      return redirect(res, buildNotionRedirectToApp(req, returnTo, {
        notion_error: 'state_mismatch'
      }), [clearCookie])
    }

    const code = String(getRequestQueryValue(req, 'code') || '').trim()
    if (!code) {
      return redirect(res, buildNotionRedirectToApp(req, returnTo, {
        notion_error: 'oauth_failed'
      }), [clearCookie])
    }

    try {
      await completeNotionAuthorization(req, env, access.session, statePayload, code)
      return redirect(res, buildNotionRedirectToApp(req, returnTo, {
        notion_status: 'connected'
      }), [clearCookie])
    } catch (error) {
      console.warn('[notion-mcp]', error instanceof Error ? error.message : String(error))
      return redirect(res, buildNotionRedirectToApp(req, returnTo, {
        notion_error: mapNotionErrorCode(error?.code || error?.message)
      }), [clearCookie])
    }
  }

  if (action === 'disconnect') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS')
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
    }

    const access = await verifyAccessRequestStrict(req)
    if (!access.ok || !access.session) {
      return sendJson(res, 401, { ok: false, error: 'access_session_required' })
    }

    try {
      await disconnectNotionConnection(env, access.session)
      return sendJson(res, 200, {
        ok: true,
        connected: false
      })
    } catch (error) {
      return sendJson(res, 503, { ok: false, error: mapNotionErrorCode(error?.code || error?.message) })
    }
  }

  if (action === 'mcp') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS')
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
    }

    const access = await verifyAccessRequestStrict(req)
    if (!access.ok || !access.session) {
      return sendJson(res, 401, { ok: false, error: 'access_session_required' })
    }

    return proxyNotionMcpRequest(req, res, env, access.session)
  }

  return sendJson(res, 400, { ok: false, error: 'unknown_action' })
}
