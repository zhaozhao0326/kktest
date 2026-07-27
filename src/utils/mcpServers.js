import { MANAGED_NOTION_SERVER_ID, MANAGED_NOTION_SERVER_NAME } from './notionMcp'

function normalizeId(value) {
  return String(value || '').trim()
}

function normalizeText(value) {
  return String(value || '').trim()
}

export function normalizeMcpServerIds(value) {
  if (!Array.isArray(value)) return []

  const seen = new Set()
  const normalized = []

  value.forEach((item) => {
    const id = normalizeId(item)
    if (!id || seen.has(id)) return
    seen.add(id)
    normalized.push(id)
  })

  return normalized
}

export function describeMcpServerSelection(serverIds, servers, options = {}) {
  const ids = normalizeMcpServerIds(serverIds)
  const fallbackLabel = options.emptyLabel || '不使用 MCP'
  if (ids.length === 0) return fallbackLabel

  const serverMap = new Map(
    (Array.isArray(servers) ? servers : [])
      .map((server) => [normalizeId(server?.id), normalizeId(server?.name) || normalizeId(server?.id)])
      .filter(([id]) => !!id)
  )

  const names = ids.map((id) => serverMap.get(id) || id)
  return names.join('、') || fallbackLabel
}

function pushUniqueServer(target, seenIds, server, source) {
  const id = normalizeId(server?.id)
  if (!id || seenIds.has(id)) return

  seenIds.add(id)
  target.push({
    ...server,
    id,
    name: normalizeText(server?.name) || id,
    source
  })
}

export function listAvailableMcpServers(toolCallingConfig) {
  const config = toolCallingConfig && typeof toolCallingConfig === 'object'
    ? toolCallingConfig
    : {}
  const servers = []
  const seenIds = new Set()

  if (config.notionEnabled === true) {
    pushUniqueServer(servers, seenIds, {
      id: MANAGED_NOTION_SERVER_ID,
      name: MANAGED_NOTION_SERVER_NAME,
      transport: 'http',
      enabled: true,
      managed: true
    }, 'notion')
  }

  ;(Array.isArray(config.mcpDirectServers) ? config.mcpDirectServers : []).forEach((server) => {
    pushUniqueServer(servers, seenIds, {
      ...server,
      transport: 'http'
    }, 'direct')
  })

  if (config.mcpBridgeEnabled === true) {
    ;(Array.isArray(config.mcpServers) ? config.mcpServers : []).forEach((server) => {
      pushUniqueServer(servers, seenIds, server, 'bridge')
    })
  }

  return servers
}

export function resolveDirectMcpServerIds(contact) {
  return normalizeMcpServerIds(contact?.mcpServerIds)
}

export function resolveGroupMultiMcpServerIds(group, member) {
  const memberIds = normalizeMcpServerIds(member?.mcpServerIds)
  if (memberIds.length > 0) return memberIds

  return normalizeMcpServerIds(group?.mcpServerIds)
}

export function resolveGroupSingleMcpServerIds(group) {
  const mergedIds = new Set(normalizeMcpServerIds(group?.mcpServerIds))

  ;(Array.isArray(group?.members) ? group.members : []).forEach((member) => {
    normalizeMcpServerIds(member?.mcpServerIds).forEach((id) => mergedIds.add(id))
  })

  return [...mergedIds]
}
