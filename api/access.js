import { readJsonBody } from '../src/utils/pushApiUtils.js'
import {
  claimAccessDeviceSlot,
  readAccessAnnouncement,
  readAccessDeviceRegistration,
  readAccessDeviceStats,
  readAccessDevicesForSession,
  removeAccessDeviceRegistration
} from '../src/utils/accessGuardStorage.js'
import {
  ACCESS_DEVICE_COOKIE_NAME,
  ACCESS_SESSION_COOKIE_NAME,
  ACCESS_STATE_COOKIE_NAME,
  buildAccessLogPayload,
  buildAppRedirectUrl,
  buildDiscordAuthorizeUrl,
  buildDiscordRedirectUri,
  createAccessDeviceCookie,
  createAccessDeviceToken,
  createAccessSessionCookie,
  createAccessSessionToken,
  createClearedCookie,
  createStateCookie,
  createStateToken,
  getRequestQueryValue,
  parseCookieHeader,
  readAccessDeviceFromCookieHeader,
  readAccessEnv,
  readAccessSessionFromCookieHeader,
  readClientIp,
  readStateFromCookieHeader,
  resolveAccessFailureStatus,
  resolveMatchingDiscordAccessRule,
  sanitizeReturnTo,
  sanitizeSessionForClient,
  verifyAccessRequest,
  verifyAccessRequestStrict
} from '../src/utils/accessControlServer.js'

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
  return String(getRequestQueryValue(req, 'action') || 'session').trim().toLowerCase()
}

function resolveDeviceCookieMaxAgeSeconds(session, env) {
  const expiresAt = Number(session?.exp || 0)
  if (Number.isFinite(expiresAt) && expiresAt > Date.now()) {
    return Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
  }
  return env.sessionMaxAgeSeconds
}

function serializeClientDevice(device = {}) {
  return {
    deviceId: String(device.deviceId || '').trim(),
    deviceName: String(device.deviceName || '').trim(),
    claimedAt: Math.max(0, Number(device.claimedAt || 0) || 0),
    lastSeenAt: Math.max(0, Number(device.lastSeenAt || 0) || 0)
  }
}

function buildEmptyStatsPayload(env) {
  return {
    ok: true,
    deviceBindingEnabled: !!env.deviceBindingEnabled,
    deviceSlotLimit: Math.max(0, Number(env.deviceSlotLimit || 0) || 0),
    generatedAt: Date.now(),
    summary: {
      totalUsers: 0,
      totalDevices: 0,
      maxDevicesPerUser: 0,
      usersAtLimit: 0
    },
    users: []
  }
}

async function exchangeDiscordCode(req, env, code) {
  const body = new URLSearchParams({
    client_id: env.clientId,
    client_secret: env.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: buildDiscordRedirectUri(req, env)
  })

  const response = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  })

  if (!response.ok) {
    throw new Error(`discord_token_exchange_failed_${response.status}`)
  }

  const data = await response.json()
  return String(data?.access_token || '')
}

async function fetchDiscordIdentity(accessToken) {
  const response = await fetch('https://discord.com/api/users/@me', {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  if (!response.ok) {
    throw new Error(`discord_identity_failed_${response.status}`)
  }

  return response.json()
}

async function fetchUserGuilds(accessToken) {
  const response = await fetch('https://discord.com/api/users/@me/guilds', {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  if (!response.ok) {
    throw new Error(`discord_guilds_failed_${response.status}`)
  }

  const guilds = await response.json()
  return Array.isArray(guilds) ? guilds : []
}

async function fetchCurrentGuildMember(accessToken, guildId) {
  const response = await fetch(`https://discord.com/api/users/@me/guilds/${guildId}/member`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  if (!response.ok) {
    throw new Error(`discord_member_failed_${guildId}_${response.status}`)
  }

  return response.json()
}

export default async function handler(req, res) {
  const action = resolveAction(req)
  const env = readAccessEnv()

  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET, POST, OPTIONS')
    return res.status(204).end()
  }

  if (action === 'discord-start') {
    if (req.method !== 'GET') {
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
    }

    const returnTo = sanitizeReturnTo(getRequestQueryValue(req, 'returnTo'))
    const shouldForce = getRequestQueryValue(req, 'force') === '1'

    if (!env.requestedEnabled) {
      return redirect(res, buildAppRedirectUrl(req, returnTo))
    }
    if (!env.discordConfigured) {
      return redirect(res, buildAppRedirectUrl(req, returnTo, {
        access_error: 'service_misconfigured'
      }))
    }

    const existingSession = readAccessSessionFromCookieHeader(String(req.headers.cookie || ''), env.sessionSecret)
    if (existingSession && !shouldForce) {
      return redirect(res, buildAppRedirectUrl(req, returnTo))
    }

    const { token } = createStateToken(returnTo, env.sessionSecret, env.stateMaxAgeSeconds)
    return redirect(res, buildDiscordAuthorizeUrl(req, env, token), [
      createStateCookie(req, token, env.stateMaxAgeSeconds)
    ])
  }

  if (action === 'discord-callback') {
    if (req.method !== 'GET') {
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
    }

    const cookieHeader = String(req.headers.cookie || '')
    const rawCookies = parseCookieHeader(cookieHeader)
    const statePayload = env.configured
      ? readStateFromCookieHeader(cookieHeader, env.sessionSecret)
      : null
    const returnTo = statePayload?.returnTo || '#/'
    const clearCookies = [
      createClearedCookie(req, ACCESS_STATE_COOKIE_NAME),
      createClearedCookie(req, ACCESS_SESSION_COOKIE_NAME),
      createClearedCookie(req, ACCESS_DEVICE_COOKIE_NAME)
    ]

    if (!env.requestedEnabled) {
      return redirect(res, buildAppRedirectUrl(req, returnTo))
    }
    if (!env.discordConfigured) {
      return redirect(res, buildAppRedirectUrl(req, returnTo, {
        access_error: 'service_misconfigured'
      }), clearCookies)
    }

    const callbackError = getRequestQueryValue(req, 'error')
    if (callbackError) {
      const errorCode = callbackError === 'access_denied' ? 'oauth_denied' : 'oauth_failed'
      return redirect(res, buildAppRedirectUrl(req, returnTo, {
        access_error: errorCode
      }), clearCookies)
    }

    const returnedState = getRequestQueryValue(req, 'state')
    const storedState = String(rawCookies[ACCESS_STATE_COOKIE_NAME] || '')
    if (!storedState || !returnedState || returnedState !== storedState || !statePayload) {
      return redirect(res, buildAppRedirectUrl(req, returnTo, {
        access_error: 'state_mismatch'
      }), clearCookies)
    }

    const code = getRequestQueryValue(req, 'code')
    if (!code) {
      return redirect(res, buildAppRedirectUrl(req, returnTo, {
        access_error: 'oauth_failed'
      }), clearCookies)
    }

    try {
      const accessToken = await exchangeDiscordCode(req, env, code)
      if (!accessToken) {
        throw new Error('discord_token_missing')
      }

      const user = await fetchDiscordIdentity(accessToken)
      const userGuilds = env.ruleCount > 0 ? await fetchUserGuilds(accessToken) : []
      const match = await resolveMatchingDiscordAccessRule(
        env.rules,
        userGuilds,
        (guildId) => fetchCurrentGuildMember(accessToken, guildId)
      )
      if (!match.matched) {
        return redirect(res, buildAppRedirectUrl(req, returnTo, {
          access_error: match.reason || 'not_in_guild'
        }), clearCookies)
      }

      const envWithMatch = match.rule ? { ...env, matchedRule: match.rule } : env
      const { token, payload: sessionPayload } = createAccessSessionToken(user, envWithMatch)
      console.info('[access-control]', JSON.stringify(buildAccessLogPayload(user, req, envWithMatch, sessionPayload)))

      return redirect(res, buildAppRedirectUrl(req, returnTo), [
        createClearedCookie(req, ACCESS_STATE_COOKIE_NAME),
        createClearedCookie(req, ACCESS_DEVICE_COOKIE_NAME),
        createAccessSessionCookie(req, token, env.sessionMaxAgeSeconds)
      ])
    } catch (error) {
      console.warn('[access-control]', error instanceof Error ? error.message : String(error))
      return redirect(res, buildAppRedirectUrl(req, returnTo, {
        access_error: 'service_unavailable'
      }), clearCookies)
    }
  }

  if (action === 'session') {
    if (req.method !== 'GET') {
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
    }

    const rawCookieHeader = String(req.headers.cookie || '')
    const cookies = parseCookieHeader(rawCookieHeader)
    const hasSessionCookie = !!cookies[ACCESS_SESSION_COOKIE_NAME]
    const hasDeviceCookie = !!cookies[ACCESS_DEVICE_COOKIE_NAME]
    const session = env.sessionSecret
      ? readAccessSessionFromCookieHeader(rawCookieHeader, env.sessionSecret)
      : null
    const device = env.sessionSecret
      ? readAccessDeviceFromCookieHeader(rawCookieHeader, env.sessionSecret)
      : null
    const cookiesToClear = []

    if (hasSessionCookie && !session) {
      cookiesToClear.push(
        createClearedCookie(req, ACCESS_SESSION_COOKIE_NAME),
        createClearedCookie(req, ACCESS_DEVICE_COOKIE_NAME)
      )
    }

    let deviceAuthenticated = false
    let sessionPayload = sanitizeSessionForClient(session)

    if (!session && hasDeviceCookie) {
      cookiesToClear.push(createClearedCookie(req, ACCESS_DEVICE_COOKIE_NAME))
    }

    if (session?.provider === 'admin') {
      if (hasDeviceCookie) {
        cookiesToClear.push(createClearedCookie(req, ACCESS_DEVICE_COOKIE_NAME))
      }
    } else if (session && env.deviceBindingEnabled) {
      const deviceMatches = !!device
        && String(device.userId || '').trim() === String(session.userId || '').trim()
        && String(device.provider || '').trim() === String(session.provider || 'discord').trim()
        && String(device.deviceId || '').trim()

      if (hasDeviceCookie && !deviceMatches) {
        cookiesToClear.push(createClearedCookie(req, ACCESS_DEVICE_COOKIE_NAME))
      }

      try {
        const registration = await readAccessDeviceRegistration(
          env,
          session,
          deviceMatches ? device.deviceId : ''
        )
        deviceAuthenticated = !!deviceMatches && !!registration?.found && !!registration?.device

        if (!deviceAuthenticated && hasDeviceCookie) {
          cookiesToClear.push(createClearedCookie(req, ACCESS_DEVICE_COOKIE_NAME))
        }

        sessionPayload = sanitizeSessionForClient(session, {
          deviceId: deviceAuthenticated ? device.deviceId : '',
          deviceName: deviceAuthenticated
            ? (registration?.device?.deviceName || device?.deviceName)
            : '',
          deviceSlotCount: registration?.slotCount ?? 0,
          deviceSlotLimit: env.deviceSlotLimit,
          deviceAuthenticated
        })
      } catch (error) {
        console.warn('[access-control]', error instanceof Error ? error.message : String(error))
        sessionPayload = sanitizeSessionForClient(session, {
          deviceSlotLimit: env.deviceSlotLimit,
          deviceAuthenticated: false
        })
      }
    }

    if (cookiesToClear.length > 0) {
      res.setHeader('Set-Cookie', [...new Set(cookiesToClear)])
    }

    return sendJson(res, 200, {
      ok: true,
      enabled: env.requestedEnabled,
      configured: env.configured,
      discordConfigured: env.discordConfigured,
      adminCodeEnabled: env.adminCodeEnabled,
      deviceBindingEnabled: env.deviceBindingEnabled,
      deviceSlotLimit: env.deviceSlotLimit,
      provider: env.provider,
      guildId: env.guildId,
      ruleCount: env.ruleCount,
      hasRoleRules: env.hasRoleRules,
      authenticated: !!session,
      deviceAuthenticated: session?.provider === 'admin'
        ? true
        : (env.deviceBindingEnabled ? deviceAuthenticated : false),
      deviceClaimRequired: !!(
        session
        && session.provider !== 'admin'
        && env.deviceBindingEnabled
        && !deviceAuthenticated
      ),
      session: sessionPayload
    })
  }

  if (action === 'device') {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
    }

    const access = verifyAccessRequest(req, env, { requireDevice: false })
    if (!access.ok) {
      const status = access.reason === 'service_misconfigured' ? 503 : 401
      return sendJson(res, status, { ok: false, error: access.reason })
    }

    const session = access.session
    if (!session) {
      return sendJson(res, 401, { ok: false, error: 'unauthorized' })
    }

    if (req.method === 'GET') {
      if (session.provider === 'admin') {
        return sendJson(res, 403, { ok: false, error: 'forbidden' })
      }

      if (!env.deviceBindingEnabled) {
        return sendJson(res, 200, {
          ok: true,
          deviceBindingEnabled: false,
          slotCount: 0,
          slotLimit: Math.max(0, Number(env.deviceSlotLimit || 0) || 0),
          devices: []
        })
      }

      try {
        const devicesResult = await readAccessDevicesForSession(env, session)
        if (!devicesResult.ok) {
          return sendJson(res, resolveAccessFailureStatus(devicesResult.reason), {
            ok: false,
            error: devicesResult.reason
          })
        }

        return sendJson(res, 200, {
          ok: true,
          deviceBindingEnabled: true,
          slotCount: devicesResult.slotCount,
          slotLimit: devicesResult.slotLimit,
          devices: devicesResult.devices.map((device) => serializeClientDevice(device))
        })
      } catch (error) {
        console.warn('[access-control]', error instanceof Error ? error.message : String(error))
        return sendJson(res, 503, { ok: false, error: 'device_binding_unavailable' })
      }
    }

    const body = readJsonBody(req)
    const actionName = String(body.action || '').trim().toLowerCase()
    if (actionName === 'release') {
      try {
        const targetDeviceId = String(body.deviceId || '').trim()
        if (session.provider === 'admin') {
          return sendJson(res, 403, { ok: false, error: 'forbidden' })
        }
        if (!env.deviceBindingEnabled) {
          return sendJson(res, 503, { ok: false, error: 'device_binding_unavailable' })
        }
        if (!targetDeviceId) {
          return sendJson(res, 400, { ok: false, error: 'bad_request' })
        }

        const releaseResult = await removeAccessDeviceRegistration(env, session, targetDeviceId)
        if (!releaseResult.ok) {
          const status = releaseResult.reason === 'bad_request'
            ? 400
            : resolveAccessFailureStatus(releaseResult.reason)
          return sendJson(res, status, { ok: false, error: releaseResult.reason })
        }

        const currentDevice = env.sessionSecret
          ? readAccessDeviceFromCookieHeader(String(req.headers.cookie || ''), env.sessionSecret)
          : null
        if (String(currentDevice?.deviceId || '').trim() === targetDeviceId) {
          res.setHeader('Set-Cookie', createClearedCookie(req, ACCESS_DEVICE_COOKIE_NAME))
        }

        return sendJson(res, 200, {
          ok: true,
          removed: releaseResult.removed,
          releasedDeviceId: targetDeviceId,
          slotCount: releaseResult.slotCount,
          slotLimit: releaseResult.slotLimit,
          devices: releaseResult.devices.map((device) => serializeClientDevice(device))
        })
      } catch (error) {
        console.warn('[access-control]', error instanceof Error ? error.message : String(error))
        return sendJson(res, 503, { ok: false, error: 'device_binding_unavailable' })
      }
    }

    if (session.provider === 'admin') {
      res.setHeader('Set-Cookie', createClearedCookie(req, ACCESS_DEVICE_COOKIE_NAME))
      return sendJson(res, 200, {
        ok: true,
        skipped: true,
        session: sanitizeSessionForClient(session)
      })
    }

    if (!env.deviceBindingEnabled) {
      return sendJson(res, 503, { ok: false, error: 'device_binding_unavailable' })
    }

    const deviceId = String(body.deviceId || '').trim()
    const deviceName = String(body.deviceName || '').trim()
    if (!deviceId) {
      return sendJson(res, 400, { ok: false, error: 'device_binding_unavailable' })
    }

    try {
      const result = await claimAccessDeviceSlot(env, session, {
        deviceId,
        deviceName,
        ip: readClientIp(req),
        userAgent: String(req.headers['user-agent'] || '').trim()
      })

      if (!result.ok) {
        const status = result.reason === 'device_limit_reached' ? 409 : 503
        return sendJson(res, status, {
          ok: false,
          error: result.reason,
          slotCount: result.slotCount ?? 0,
          slotLimit: result.slotLimit ?? env.deviceSlotLimit
        })
      }

      const maxAgeSeconds = resolveDeviceCookieMaxAgeSeconds(session, env)
      const { token } = createAccessDeviceToken(session, result.device.deviceId, env.sessionSecret)
      res.setHeader('Set-Cookie', createAccessDeviceCookie(req, token, maxAgeSeconds))

      return sendJson(res, 200, {
        ok: true,
        deviceId: result.device.deviceId,
        deviceName: result.device.deviceName,
        slotCount: result.slotCount,
        slotLimit: result.slotLimit,
        session: sanitizeSessionForClient(session, {
          deviceId: result.device.deviceId,
          deviceName: result.device.deviceName,
          deviceSlotCount: result.slotCount,
          deviceSlotLimit: result.slotLimit,
          deviceAuthenticated: true
        })
      })
    } catch (error) {
      console.warn('[access-control]', error instanceof Error ? error.message : String(error))
      return sendJson(res, 503, { ok: false, error: 'device_binding_unavailable' })
    }
  }

  if (action === 'admin-login') {
    if (req.method !== 'POST') {
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
    }

    if (!env.requestedEnabled || !env.adminCodeEnabled) {
      return sendJson(res, 503, { ok: false, error: 'service_misconfigured' })
    }

    const body = readJsonBody(req)
    const code = String(body.code || '').trim()
    if (!code || code !== env.adminCode) {
      return sendJson(res, 401, { ok: false, error: 'invalid_admin_code' })
    }

    const { token, payload } = createAccessSessionToken(null, env, {
      provider: 'admin',
      globalName: env.adminLabel
    })

    console.info('[access-control]', JSON.stringify(buildAccessLogPayload({
      id: 'admin',
      username: 'admin',
      global_name: env.adminLabel
    }, req, env, payload)))

    res.setHeader('Set-Cookie', [
      createClearedCookie(req, ACCESS_DEVICE_COOKIE_NAME),
      createAccessSessionCookie(req, token, env.sessionMaxAgeSeconds)
    ])

    return sendJson(res, 200, {
      ok: true,
      session: sanitizeSessionForClient(payload)
    })
  }

  if (action === 'admin-stats') {
    if (req.method !== 'GET') {
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
    }

    const access = await verifyAccessRequestStrict(req, env)
    if (!access.ok) {
      return sendJson(res, resolveAccessFailureStatus(access.reason), { ok: false, error: access.reason })
    }

    if (access.session?.provider !== 'admin') {
      return sendJson(res, 403, { ok: false, error: 'forbidden' })
    }

    if (!env.deviceBindingEnabled) {
      return sendJson(res, 200, buildEmptyStatsPayload(env))
    }

    try {
      const stats = await readAccessDeviceStats(env)
      if (!stats.ok) {
        return sendJson(res, resolveAccessFailureStatus(stats.reason), { ok: false, error: stats.reason })
      }

      return sendJson(res, 200, {
        ok: true,
        deviceBindingEnabled: true,
        deviceSlotLimit: Math.max(0, Number(env.deviceSlotLimit || 0) || 0),
        generatedAt: Date.now(),
        summary: stats.summary,
        users: stats.users
      })
    } catch (error) {
      console.warn('[access-control]', error instanceof Error ? error.message : String(error))
      return sendJson(res, 503, { ok: false, error: 'device_binding_unavailable' })
    }
  }

  if (action === 'announcement') {
    if (req.method !== 'GET') {
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
    }

    try {
      const announcement = await readAccessAnnouncement(env)
      return sendJson(res, 200, { ok: true, announcement })
    } catch (error) {
      console.warn('[access-control]', error instanceof Error ? error.message : String(error))
      return sendJson(res, 200, { ok: true, announcement: null })
    }
  }

  if (action === 'logout') {
    if (req.method !== 'POST') {
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
    }

    res.setHeader('Set-Cookie', [
      createClearedCookie(req, ACCESS_SESSION_COOKIE_NAME),
      createClearedCookie(req, ACCESS_STATE_COOKIE_NAME),
      createClearedCookie(req, ACCESS_DEVICE_COOKIE_NAME)
    ])
    return sendJson(res, 200, { ok: true })
  }

  return sendJson(res, 400, { ok: false, error: 'unknown_action' })
}
