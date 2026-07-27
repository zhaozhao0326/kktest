import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { Redis } from '@upstash/redis'
import { buildAppRedirectUrl, getRequestOrigin, sanitizeReturnTo } from './accessControlServer.js'
import { MANAGED_NOTION_SERVER_ID, MANAGED_NOTION_SERVER_NAME } from './notionMcp.js'

export const NOTION_MCP_STATE_COOKIE_NAME = 'aichat_notion_oauth'
export const NOTION_MCP_DEFAULT_SERVER_URL = 'https://mcp.notion.com/mcp'

const DEFAULT_STORAGE_PREFIX = 'aichat_access_guard'
const DEFAULT_STATE_MAX_AGE_SECONDS = 10 * 60
const DEFAULT_ACCESS_TOKEN_TTL_MS = 55 * 60 * 1000
const METADATA_CACHE_TTL_MS = 6 * 60 * 60 * 1000

let cachedRedisClient = null
let cachedRedisKey = ''
let cachedMetadata = null

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeTimestamp(value, fallback = 0) {
  const timestamp = Number(value || 0)
  if (!Number.isFinite(timestamp) || timestamp <= 0) return fallback
  return Math.round(timestamp)
}

function ensureTrailingSlash(value) {
  const raw = normalizeText(value)
  return raw.endsWith('/') ? raw : `${raw}/`
}

function hashText(value) {
  return createHash('sha256').update(String(value || '')).digest('hex')
}

function deriveKey(secret) {
  return createHash('sha256').update(String(secret || '')).digest()
}

function encryptText(value, secret) {
  const plaintext = normalizeText(value)
  if (!plaintext) return ''
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`
}

function decryptText(value, secret) {
  const raw = normalizeText(value)
  if (!raw) return ''
  const parts = raw.split('.')
  if (parts.length !== 3) return ''

  try {
    const [ivEncoded, tagEncoded, encryptedEncoded] = parts
    const decipher = createDecipheriv(
      'aes-256-gcm',
      deriveKey(secret),
      Buffer.from(ivEncoded, 'base64url')
    )
    decipher.setAuthTag(Buffer.from(tagEncoded, 'base64url'))
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedEncoded, 'base64url')),
      decipher.final()
    ])
    return decrypted.toString('utf8')
  } catch {
    return ''
  }
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${value}`]
  if (options.maxAge != null) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`)
  }
  parts.push(`Path=${options.path || '/'}`)
  parts.push(`SameSite=${options.sameSite || 'Lax'}`)
  parts.push('HttpOnly')
  if (options.secure) parts.push('Secure')
  return parts.join('; ')
}

function shouldUseSecureCookies(req) {
  const proto = normalizeText(req?.headers?.['x-forwarded-proto']).toLowerCase()
  const host = normalizeText(req?.headers?.['x-forwarded-host'] || req?.headers?.host).toLowerCase()
  if (proto === 'https') return true
  return !(host.startsWith('localhost') || host.startsWith('127.0.0.1'))
}

function signPayload(encodedPayload, secret) {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url')
}

function encodeSignedPayload(payload, secret) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encodedPayload}.${signPayload(encodedPayload, secret)}`
}

function decodeSignedPayload(token, secret) {
  const rawToken = normalizeText(token)
  if (!rawToken || !secret) return null

  const parts = rawToken.split('.')
  if (parts.length !== 2) return null

  const [encodedPayload, signature] = parts
  const expected = signPayload(encodedPayload, secret)
  if (signature.length !== expected.length) return null

  try {
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return null
    }
  } catch {
    return null
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
    if (normalizeTimestamp(payload?.exp) > 0 && normalizeTimestamp(payload.exp) < Date.now()) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

function readCookieValue(cookieHeader = '', cookieName = '') {
  return String(cookieHeader || '')
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((found, entry) => {
      if (found) return found
      const separator = entry.indexOf('=')
      if (separator <= 0) return found
      const key = entry.slice(0, separator).trim()
      if (key !== cookieName) return found
      return entry.slice(separator + 1).trim()
    }, '')
}

function getStoragePrefix(env = process.env) {
  return normalizeText(env?.storagePrefix || env?.NOTION_MCP_STORAGE_PREFIX || env?.ACCESS_GUARD_STORAGE_PREFIX)
    || DEFAULT_STORAGE_PREFIX
}

function getRedisConfig(env = process.env) {
  const url = normalizeText(env?.storageUrl || env?.UPSTASH_REDIS_REST_URL)
  const token = normalizeText(env?.storageToken || env?.UPSTASH_REDIS_REST_TOKEN)
  return { url, token }
}

function getRedisClient(env = process.env) {
  const { url, token } = getRedisConfig(env)
  if (!url || !token) return null

  const cacheKey = `${url}::${token}`
  if (!cachedRedisClient || cachedRedisKey !== cacheKey) {
    cachedRedisClient = new Redis({ url, token })
    cachedRedisKey = cacheKey
  }

  return cachedRedisClient
}

function buildConnectionKey(env, session) {
  return `${getStoragePrefix(env)}:notion_mcp:connection:${normalizeText(session?.provider)}:${normalizeText(session?.userId)}`
}

function buildClientRegistrationKey(env, redirectUri) {
  return `${getStoragePrefix(env)}:notion_mcp:client:${hashText(redirectUri)}`
}

function buildRefreshLockKey(env, session) {
  return `${getStoragePrefix(env)}:notion_mcp:refresh_lock:${normalizeText(session?.provider)}:${normalizeText(session?.userId)}`
}

function buildManagedServerPayload() {
  return {
    id: MANAGED_NOTION_SERVER_ID,
    name: MANAGED_NOTION_SERVER_NAME,
    url: '/api/notion?action=mcp'
  }
}

function toBase64Url(input) {
  return Buffer.from(input).toString('base64url')
}

function generatePkceVerifier() {
  return toBase64Url(randomBytes(32))
}

function generatePkceChallenge(verifier) {
  return createHash('sha256').update(verifier).digest('base64url')
}

function createStateCookie(req, payload, secret) {
  const token = encodeSignedPayload(payload, secret)
  return serializeCookie(NOTION_MCP_STATE_COOKIE_NAME, token, {
    maxAge: DEFAULT_STATE_MAX_AGE_SECONDS,
    secure: shouldUseSecureCookies(req)
  })
}

export function createClearedNotionStateCookie(req) {
  return serializeCookie(NOTION_MCP_STATE_COOKIE_NAME, '', {
    maxAge: 0,
    secure: shouldUseSecureCookies(req)
  })
}

export function readNotionStateFromCookieHeader(cookieHeader, secret) {
  return decodeSignedPayload(readCookieValue(cookieHeader, NOTION_MCP_STATE_COOKIE_NAME), secret)
}

function normalizeConnectionRecord(record, env) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null

  return {
    v: 1,
    provider: normalizeText(record.provider),
    userId: normalizeText(record.userId),
    clientId: normalizeText(record.clientId),
    clientSecretEnc: normalizeText(record.clientSecretEnc),
    accessTokenEnc: normalizeText(record.accessTokenEnc),
    refreshTokenEnc: normalizeText(record.refreshTokenEnc),
    previousRefreshTokenEnc: normalizeText(record.previousRefreshTokenEnc),
    accessTokenExpiresAt: normalizeTimestamp(record.accessTokenExpiresAt),
    workspaceId: normalizeText(record.workspaceId),
    workspaceName: normalizeText(record.workspaceName),
    workspaceIcon: normalizeText(record.workspaceIcon),
    ownerUserId: normalizeText(record.ownerUserId),
    ownerName: normalizeText(record.ownerName),
    botId: normalizeText(record.botId),
    connectedAt: normalizeTimestamp(record.connectedAt),
    updatedAt: normalizeTimestamp(record.updatedAt),
    lastError: normalizeText(record.lastError),
    lastErrorAt: normalizeTimestamp(record.lastErrorAt),
    needsReconnect: !!record.needsReconnect,
    meta: {
      scope: normalizeText(record?.meta?.scope || record.scope),
      tokenType: normalizeText(record?.meta?.tokenType || record.tokenType)
    },
    encryptionSecret: env.encryptionSecret
  }
}

function serializeConnectionRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null

  return {
    v: 1,
    provider: normalizeText(record.provider),
    userId: normalizeText(record.userId),
    clientId: normalizeText(record.clientId),
    clientSecretEnc: normalizeText(record.clientSecretEnc),
    accessTokenEnc: normalizeText(record.accessTokenEnc),
    refreshTokenEnc: normalizeText(record.refreshTokenEnc),
    previousRefreshTokenEnc: normalizeText(record.previousRefreshTokenEnc),
    accessTokenExpiresAt: normalizeTimestamp(record.accessTokenExpiresAt),
    workspaceId: normalizeText(record.workspaceId),
    workspaceName: normalizeText(record.workspaceName),
    workspaceIcon: normalizeText(record.workspaceIcon),
    ownerUserId: normalizeText(record.ownerUserId),
    ownerName: normalizeText(record.ownerName),
    botId: normalizeText(record.botId),
    connectedAt: normalizeTimestamp(record.connectedAt),
    updatedAt: normalizeTimestamp(record.updatedAt),
    lastError: normalizeText(record.lastError),
    lastErrorAt: normalizeTimestamp(record.lastErrorAt),
    needsReconnect: !!record.needsReconnect,
    meta: {
      scope: normalizeText(record?.meta?.scope),
      tokenType: normalizeText(record?.meta?.tokenType)
    }
  }
}

function toPublicConnection(record) {
  if (!record) return null
  return {
    workspaceId: record.workspaceId,
    workspaceName: record.workspaceName,
    workspaceIcon: record.workspaceIcon,
    ownerUserId: record.ownerUserId,
    ownerName: record.ownerName,
    botId: record.botId,
    connectedAt: record.connectedAt,
    updatedAt: record.updatedAt,
    expiresAt: record.accessTokenExpiresAt,
    lastError: record.lastError,
    lastErrorAt: record.lastErrorAt,
    needsReconnect: !!record.needsReconnect
  }
}

async function readConnectionRecord(env, session) {
  const redis = getRedisClient(env)
  if (!redis) return null

  const raw = await redis.get(buildConnectionKey(env, session))
  if (!raw) return null

  if (typeof raw === 'string') {
    try {
      return normalizeConnectionRecord(JSON.parse(raw), env)
    } catch {
      return null
    }
  }

  return normalizeConnectionRecord(raw, env)
}

async function writeConnectionRecord(env, session, record) {
  const redis = getRedisClient(env)
  if (!redis) {
    throw new Error('storage_unavailable')
  }
  const serializableRecord = serializeConnectionRecord(record)
  if (!serializableRecord) {
    throw new Error('storage_unavailable')
  }
  await redis.set(buildConnectionKey(env, session), JSON.stringify(serializableRecord))
}

async function deleteConnectionRecord(env, session) {
  const redis = getRedisClient(env)
  if (!redis) return
  await redis.del(buildConnectionKey(env, session))
}

async function readClientRegistration(env, redirectUri) {
  const redis = getRedisClient(env)
  if (!redis) return null
  const raw = await redis.get(buildClientRegistrationKey(env, redirectUri))
  if (!raw) return null

  let parsed = raw
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch {
      return null
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  return {
    clientId: normalizeText(parsed.clientId),
    clientSecret: decryptText(parsed.clientSecretEnc, env.encryptionSecret),
    registeredAt: normalizeTimestamp(parsed.registeredAt),
    redirectUri: normalizeText(parsed.redirectUri)
  }
}

async function writeClientRegistration(env, redirectUri, client) {
  const redis = getRedisClient(env)
  if (!redis) {
    throw new Error('storage_unavailable')
  }

  await redis.set(
    buildClientRegistrationKey(env, redirectUri),
    JSON.stringify({
      clientId: client.clientId,
      clientSecretEnc: encryptText(client.clientSecret, env.encryptionSecret),
      registeredAt: Date.now(),
      redirectUri
    })
  )
}

function readResponseText(response) {
  return response.text().catch(() => '')
}

async function fetchJson(url, options = {}, contextLabel = 'request') {
  const response = await fetch(url, options)
  if (!response.ok) {
    const message = await readResponseText(response)
    throw new Error(`${contextLabel}_failed_${response.status}${message ? `: ${message}` : ''}`)
  }
  return response.json()
}

function resolveProtectedResourceUrls(serverUrl) {
  const normalized = normalizeText(serverUrl) || NOTION_MCP_DEFAULT_SERVER_URL
  const candidates = new Set()

  try {
    const url = new URL(normalized)
    candidates.add(new URL('/.well-known/oauth-protected-resource', url).toString())
    candidates.add(new URL('.well-known/oauth-protected-resource', ensureTrailingSlash(url.toString())).toString())
  } catch {
    // ignore invalid urls
  }

  return [...candidates]
}

function resolveAuthorizationServerMetadataUrls(authServerUrl) {
  const normalized = normalizeText(authServerUrl)
  const candidates = new Set()
  if (!normalized) return []

  try {
    const url = new URL(normalized)
    candidates.add(new URL('/.well-known/oauth-authorization-server', url).toString())
    candidates.add(new URL('.well-known/oauth-authorization-server', ensureTrailingSlash(url.toString())).toString())
  } catch {
    // ignore invalid urls
  }

  return [...candidates]
}

async function discoverNotionOAuthMetadata(force = false) {
  if (!force && cachedMetadata && (Date.now() - cachedMetadata.at) < METADATA_CACHE_TTL_MS) {
    return { ...cachedMetadata.value }
  }

  let protectedResource = null
  for (const candidate of resolveProtectedResourceUrls(NOTION_MCP_DEFAULT_SERVER_URL)) {
    try {
      protectedResource = await fetchJson(candidate, {
        method: 'GET',
        headers: { Accept: 'application/json' }
      }, 'protected_resource_metadata')
      break
    } catch {
      // try next candidate
    }
  }

  if (!protectedResource) {
    throw new Error('protected_resource_metadata_unavailable')
  }

  const authServers = Array.isArray(protectedResource?.authorization_servers)
    ? protectedResource.authorization_servers.map((item) => normalizeText(item)).filter(Boolean)
    : []
  if (authServers.length === 0) {
    throw new Error('authorization_server_missing')
  }

  let metadata = null
  for (const candidate of resolveAuthorizationServerMetadataUrls(authServers[0])) {
    try {
      metadata = await fetchJson(candidate, {
        method: 'GET',
        headers: { Accept: 'application/json' }
      }, 'authorization_server_metadata')
      break
    } catch {
      // try next candidate
    }
  }

  if (!metadata?.authorization_endpoint || !metadata?.token_endpoint) {
    throw new Error('authorization_metadata_incomplete')
  }

  cachedMetadata = {
    at: Date.now(),
    value: {
      issuer: normalizeText(metadata.issuer || authServers[0]),
      authorization_endpoint: normalizeText(metadata.authorization_endpoint),
      token_endpoint: normalizeText(metadata.token_endpoint),
      registration_endpoint: normalizeText(metadata.registration_endpoint),
      revocation_endpoint: normalizeText(metadata.revocation_endpoint)
    }
  }

  return { ...cachedMetadata.value }
}

function readNotionVersionHeader(env = process.env) {
  return normalizeText(env.NOTION_VERSION) || '2025-09-03'
}

async function registerDynamicClient(req, env, metadata, redirectUri) {
  if (!metadata?.registration_endpoint) {
    throw new Error('registration_not_supported')
  }

  const origin = getRequestOrigin(req)
  const payload = {
    client_name: 'aichat-vite',
    client_uri: origin || undefined,
    redirect_uris: [redirectUri],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none'
  }

  const response = await fetch(metadata.registration_endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Notion-Version': readNotionVersionHeader(env)
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    const body = await readResponseText(response)
    throw new Error(`client_registration_failed_${response.status}${body ? `: ${body}` : ''}`)
  }

  const data = await response.json()
  const client = {
    clientId: normalizeText(data?.client_id),
    clientSecret: normalizeText(data?.client_secret)
  }

  if (!client.clientId) {
    throw new Error('client_registration_missing_client_id')
  }

  await writeClientRegistration(env, redirectUri, client)
  return client
}

async function resolveClientCredentials(req, env, metadata, redirectUri) {
  const envClientId = normalizeText(env.clientId)
  if (envClientId) {
    return {
      clientId: envClientId,
      clientSecret: normalizeText(env.clientSecret)
    }
  }

  const cached = await readClientRegistration(env, redirectUri)
  if (cached?.clientId) {
    return cached
  }

  return registerDynamicClient(req, env, metadata, redirectUri)
}

async function resolveStateClientSecret(env, statePayload) {
  const clientId = normalizeText(statePayload?.clientId)
  if (!clientId) return ''

  if (clientId === normalizeText(env.clientId)) {
    return normalizeText(env.clientSecret)
  }

  const redirectUri = normalizeText(statePayload?.redirectUri)
  if (!redirectUri) return ''

  const cached = await readClientRegistration(env, redirectUri)
  return cached?.clientId === clientId ? normalizeText(cached.clientSecret) : ''
}

function buildAuthorizationUrl(metadata, clientId, redirectUri, codeChallenge, state) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'consent'
  })
  return `${metadata.authorization_endpoint}?${params.toString()}`
}

async function exchangeOAuthToken(metadata, env, payload) {
  const body = new URLSearchParams()
  Object.entries(payload).forEach(([key, value]) => {
    const text = normalizeText(value)
    if (text) body.set(key, text)
  })

  const response = await fetch(metadata.token_endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Notion-Version': readNotionVersionHeader(env)
    },
    body: body.toString()
  })

  const text = await readResponseText(response)
  let data = {}
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { raw: text }
    }
  }

  if (!response.ok) {
    const errorCode = normalizeText(data?.error)
    const description = normalizeText(data?.error_description || data?.message || text)
    const error = new Error(errorCode || `oauth_token_failed_${response.status}`)
    error.code = errorCode || `oauth_token_failed_${response.status}`
    error.description = description
    throw error
  }

  return data
}

function buildConnectionRecord(env, session, tokenPayload, client, previous = null) {
  const accessToken = normalizeText(tokenPayload?.access_token)
  const refreshToken = normalizeText(tokenPayload?.refresh_token || previous?.refreshToken)
  const previousRefreshToken = normalizeText(
    tokenPayload?.refresh_token && tokenPayload.refresh_token !== previous?.refreshToken
      ? previous?.refreshToken
      : previous?.previousRefreshToken
  )
  const expiresInSeconds = Math.max(0, Number(tokenPayload?.expires_in || 0) || 0)
  const accessTokenExpiresAt = expiresInSeconds > 0
    ? Date.now() + (expiresInSeconds * 1000)
    : (Date.now() + DEFAULT_ACCESS_TOKEN_TTL_MS)

  return {
    v: 1,
    provider: normalizeText(session?.provider),
    userId: normalizeText(session?.userId),
    clientId: normalizeText(client?.clientId),
    clientSecretEnc: encryptText(client?.clientSecret, env.encryptionSecret),
    accessTokenEnc: encryptText(accessToken, env.encryptionSecret),
    refreshTokenEnc: encryptText(refreshToken, env.encryptionSecret),
    previousRefreshTokenEnc: encryptText(previousRefreshToken, env.encryptionSecret),
    accessTokenExpiresAt,
    workspaceId: normalizeText(tokenPayload?.workspace_id),
    workspaceName: normalizeText(tokenPayload?.workspace_name),
    workspaceIcon: normalizeText(tokenPayload?.workspace_icon),
    ownerUserId: normalizeText(tokenPayload?.owner?.user?.id),
    ownerName: normalizeText(tokenPayload?.owner?.user?.name || tokenPayload?.owner?.user?.person?.email),
    botId: normalizeText(tokenPayload?.bot_id),
    connectedAt: previous?.connectedAt || Date.now(),
    updatedAt: Date.now(),
    lastError: '',
    lastErrorAt: 0,
    needsReconnect: false,
    meta: {
      scope: normalizeText(tokenPayload?.scope),
      tokenType: normalizeText(tokenPayload?.token_type)
    }
  }
}

async function persistTokenResponse(env, session, tokenPayload, client, previous = null) {
  const record = buildConnectionRecord(env, session, tokenPayload, client, previous)
  await writeConnectionRecord(env, session, record)
  return normalizeConnectionRecord(record, env)
}

async function updateConnectionError(env, session, record, errorCode, options = {}) {
  if (!record) return null
  const next = {
    ...record,
    updatedAt: Date.now(),
    lastError: normalizeText(errorCode),
    lastErrorAt: Date.now(),
    needsReconnect: !!options.needsReconnect,
    accessTokenEnc: options.clearTokens ? '' : record.accessTokenEnc,
    refreshTokenEnc: options.clearTokens ? '' : record.refreshTokenEnc,
    previousRefreshTokenEnc: options.clearTokens ? '' : record.previousRefreshTokenEnc
  }
  await writeConnectionRecord(env, session, next)
  return normalizeConnectionRecord(next, env)
}

async function acquireRefreshLock(env, session) {
  const redis = getRedisClient(env)
  if (!redis) return ''
  const token = randomBytes(8).toString('hex')

  try {
    const result = await redis.set(buildRefreshLockKey(env, session), token, { nx: true, ex: 20 })
    return result ? token : ''
  } catch {
    return ''
  }
}

async function releaseRefreshLock(env, session) {
  const redis = getRedisClient(env)
  if (!redis) return
  try {
    await redis.del(buildRefreshLockKey(env, session))
  } catch {
    // ignore lock release failures
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function waitForRefreshedConnection(env, session, staleExpiresAt) {
  for (let i = 0; i < 4; i += 1) {
    await sleep(200)
    const latest = await readConnectionRecord(env, session)
    if (latest && latest.accessTokenExpiresAt > staleExpiresAt) {
      return latest
    }
  }
  return readConnectionRecord(env, session)
}

function readConnectionSecrets(record) {
  return {
    clientSecret: decryptText(record?.clientSecretEnc, record?.encryptionSecret),
    accessToken: decryptText(record?.accessTokenEnc, record?.encryptionSecret),
    refreshToken: decryptText(record?.refreshTokenEnc, record?.encryptionSecret),
    previousRefreshToken: decryptText(record?.previousRefreshTokenEnc, record?.encryptionSecret)
  }
}

async function refreshConnectionToken(env, session, record) {
  const metadata = await discoverNotionOAuthMetadata()
  const secrets = readConnectionSecrets(record)
  const refreshToken = normalizeText(secrets.refreshToken)
  if (!refreshToken || !record?.clientId) {
    return updateConnectionError(env, session, record, 'reauth_required', {
      clearTokens: true,
      needsReconnect: true
    })
  }

  const client = {
    clientId: record.clientId,
    clientSecret: secrets.clientSecret
  }

  try {
    const payload = await exchangeOAuthToken(metadata, env, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: client.clientId,
      client_secret: client.clientSecret
    })
    return persistTokenResponse(env, session, payload, client, {
      ...record,
      connectedAt: record.connectedAt,
      refreshToken,
      previousRefreshToken: secrets.previousRefreshToken
    })
  } catch (error) {
    if (normalizeText(error?.code) === 'invalid_grant' && secrets.previousRefreshToken && secrets.previousRefreshToken !== refreshToken) {
      try {
        const payload = await exchangeOAuthToken(metadata, env, {
          grant_type: 'refresh_token',
          refresh_token: secrets.previousRefreshToken,
          client_id: client.clientId,
          client_secret: client.clientSecret
        })
        return persistTokenResponse(env, session, payload, client, {
          ...record,
          connectedAt: record.connectedAt,
          refreshToken: secrets.previousRefreshToken,
          previousRefreshToken: refreshToken
        })
      } catch {
        // fall through
      }
    }

    if (normalizeText(error?.code) === 'invalid_grant') {
      return updateConnectionError(env, session, record, 'reauth_required', {
        clearTokens: true,
        needsReconnect: true
      })
    }

    return updateConnectionError(env, session, record, normalizeText(error?.code || error?.message || 'refresh_failed'))
  }
}

async function ensureConnectionAccessToken(env, session, options = {}) {
  let record = await readConnectionRecord(env, session)
  if (!record) {
    const error = new Error('not_connected')
    error.code = 'not_connected'
    throw error
  }
  if (record.needsReconnect) {
    const error = new Error('reauth_required')
    error.code = 'reauth_required'
    throw error
  }

  const now = Date.now()
  const shouldRefresh = !!options.forceRefresh || record.accessTokenExpiresAt <= (now + 60 * 1000)
  if (!shouldRefresh) {
    return {
      record,
      accessToken: readConnectionSecrets(record).accessToken
    }
  }

  const lockToken = await acquireRefreshLock(env, session)
  if (!lockToken) {
    const latest = await waitForRefreshedConnection(env, session, record.accessTokenExpiresAt)
    if (!latest) {
      const error = new Error('reauth_required')
      error.code = 'reauth_required'
      throw error
    }
    record = latest
  } else {
    try {
      record = await refreshConnectionToken(env, session, record)
    } finally {
      await releaseRefreshLock(env, session)
    }
  }

  if (!record || record.needsReconnect) {
    const error = new Error('reauth_required')
    error.code = 'reauth_required'
    throw error
  }

  const accessToken = readConnectionSecrets(record).accessToken
  if (!accessToken) {
    const error = new Error('reauth_required')
    error.code = 'reauth_required'
    throw error
  }

  return { record, accessToken }
}

function buildSupportPayload(env, session, reason = '') {
  const normalizedReason = normalizeText(reason)
  return {
    ok: true,
    supported: !normalizedReason,
    reason: normalizedReason,
    connected: false,
    connection: null,
    server: buildManagedServerPayload(),
    requiresAuth: normalizedReason === 'access_session_required'
  }
}

export function readNotionMcpEnv(envSource = process.env) {
  const storage = getRedisConfig(envSource)
  const encryptionSecret = normalizeText(envSource.NOTION_MCP_ENCRYPTION_SECRET)
    || normalizeText(envSource.ACCESS_GUARD_SESSION_SECRET)
  const cookieSecret = normalizeText(envSource.NOTION_MCP_COOKIE_SECRET) || encryptionSecret

  return {
    storageUrl: storage.url,
    storageToken: storage.token,
    storagePrefix: getStoragePrefix(envSource),
    encryptionSecret,
    cookieSecret,
    clientId: normalizeText(envSource.NOTION_MCP_CLIENT_ID),
    clientSecret: normalizeText(envSource.NOTION_MCP_CLIENT_SECRET)
  }
}

export function resolveNotionSupportStatus(env, session = null) {
  if (!session?.provider || !session?.userId) {
    return buildSupportPayload(env, session, 'access_session_required')
  }
  if (!normalizeText(env?.storageUrl) || !normalizeText(env?.storageToken)) {
    return buildSupportPayload(env, session, 'storage_unavailable')
  }
  if (!normalizeText(env?.encryptionSecret) || !normalizeText(env?.cookieSecret)) {
    return buildSupportPayload(env, session, 'encryption_unavailable')
  }
  return buildSupportPayload(env, session)
}

export function buildNotionRedirectUri(req) {
  const origin = getRequestOrigin(req)
  return origin ? `${origin}/api/notion?action=callback` : '/api/notion?action=callback'
}

export async function startNotionAuthorization(req, env, session, returnTo = '#/') {
  const support = resolveNotionSupportStatus(env, session)
  if (!support.supported) {
    const error = new Error(support.reason || 'unsupported')
    error.code = support.reason || 'unsupported'
    throw error
  }

  const redirectUri = buildNotionRedirectUri(req)
  const metadata = await discoverNotionOAuthMetadata()
  const client = await resolveClientCredentials(req, env, metadata, redirectUri)
  const state = randomBytes(16).toString('hex')
  const codeVerifier = generatePkceVerifier()
  const codeChallenge = generatePkceChallenge(codeVerifier)
  const statePayload = {
    state,
    codeVerifier,
    returnTo: sanitizeReturnTo(returnTo),
    clientId: client.clientId,
    redirectUri,
    exp: Date.now() + (DEFAULT_STATE_MAX_AGE_SECONDS * 1000)
  }

  return {
    authorizationUrl: buildAuthorizationUrl(metadata, client.clientId, redirectUri, codeChallenge, state),
    stateCookie: createStateCookie(req, statePayload, env.cookieSecret)
  }
}

export async function completeNotionAuthorization(req, env, session, statePayload, code) {
  const support = resolveNotionSupportStatus(env, session)
  if (!support.supported) {
    const error = new Error(support.reason || 'unsupported')
    error.code = support.reason || 'unsupported'
    throw error
  }

  const metadata = await discoverNotionOAuthMetadata()
  const clientSecret = await resolveStateClientSecret(env, statePayload)
  const tokenPayload = await exchangeOAuthToken(metadata, env, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: normalizeText(statePayload?.redirectUri) || buildNotionRedirectUri(req),
    client_id: normalizeText(statePayload?.clientId),
    client_secret: clientSecret,
    code_verifier: normalizeText(statePayload?.codeVerifier)
  })

  return persistTokenResponse(env, session, tokenPayload, {
    clientId: normalizeText(statePayload?.clientId),
    clientSecret
  })
}

export async function readNotionConnectionStatus(env, session) {
  const support = resolveNotionSupportStatus(env, session)
  if (!support.supported) {
    return support
  }

  const record = await readConnectionRecord(env, session)
  return {
    ok: true,
    supported: true,
    reason: '',
    connected: !!record && !record.needsReconnect,
    needsReconnect: !!record?.needsReconnect,
    connection: toPublicConnection(record),
    server: buildManagedServerPayload(),
    requiresAuth: false
  }
}

export async function disconnectNotionConnection(env, session) {
  const support = resolveNotionSupportStatus(env, session)
  if (!support.supported) {
    const error = new Error(support.reason || 'unsupported')
    error.code = support.reason || 'unsupported'
    throw error
  }

  await deleteConnectionRecord(env, session)
  return {
    ok: true
  }
}

async function forwardMcpRequest(req, res, accessToken) {
  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {})
  const incomingSessionId = normalizeText(req.headers['mcp-session-id'])
  const incomingProtocolVersion = normalizeText(req.headers['mcp-protocol-version'])
  const upstream = await fetch(NOTION_MCP_DEFAULT_SERVER_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(incomingSessionId ? { 'Mcp-Session-Id': incomingSessionId } : {}),
      ...(incomingProtocolVersion ? { 'Mcp-Protocol-Version': incomingProtocolVersion } : {})
    },
    body
  })

  if (upstream.status === 401) {
    const error = new Error('upstream_unauthorized')
    error.code = 'upstream_unauthorized'
    throw error
  }

  res.status(upstream.status)
  const contentType = upstream.headers.get('content-type')
  if (contentType) res.setHeader('Content-Type', contentType)
  const cacheControl = upstream.headers.get('cache-control')
  if (cacheControl) res.setHeader('Cache-Control', cacheControl)
  const sessionId = upstream.headers.get('mcp-session-id')
  if (sessionId) res.setHeader('Mcp-Session-Id', sessionId)
  const protocolVersion = upstream.headers.get('mcp-protocol-version')
  if (protocolVersion) res.setHeader('Mcp-Protocol-Version', protocolVersion)

  if (!upstream.body?.getReader) {
    const buffer = Buffer.from(await upstream.arrayBuffer())
    return res.send(buffer)
  }

  const reader = upstream.body.getReader()
  res.flushHeaders?.()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value?.length) res.write(Buffer.from(value))
    res.flush?.()
  }
  return res.end()
}

export async function proxyNotionMcpRequest(req, res, env, session) {
  const support = resolveNotionSupportStatus(env, session)
  if (!support.supported) {
    return res.status(401).json({ ok: false, error: support.reason || 'unsupported' })
  }

  try {
    const { accessToken } = await ensureConnectionAccessToken(env, session)
    await forwardMcpRequest(req, res, accessToken)
  } catch (error) {
    const code = normalizeText(error?.code || error?.message || 'service_unavailable')
    if (code === 'not_connected') {
      return res.status(401).json({ ok: false, error: 'not_connected' })
    }
    if (code === 'reauth_required') {
      return res.status(401).json({ ok: false, error: 'reauth_required' })
    }

    try {
      const { accessToken } = await ensureConnectionAccessToken(env, session, { forceRefresh: true })
      await forwardMcpRequest(req, res, accessToken)
      return
    } catch (retryError) {
      const retryCode = normalizeText(retryError?.code || retryError?.message || 'service_unavailable')
      const status = retryCode === 'reauth_required' ? 401 : 502
      return res.status(status).json({
        ok: false,
        error: retryCode
      })
    }
  }
}

export function buildNotionRedirectToApp(req, returnTo = '#/', params = {}) {
  return buildAppRedirectUrl(req, returnTo, params)
}
