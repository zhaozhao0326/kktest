function emptyToolPreparation(externalExecutors = null) {
  return { tools: null, toolContext: null, externalExecutors }
}

export function normalizeToolCallingMode(value) {
  const mode = String(value || '').trim().toLowerCase()
  return mode === 'off' || mode === 'always' || mode === 'intent' ? mode : 'intent'
}

export function getEffectiveToolCallingMode(settingsStore) {
  return settingsStore?.allowToolCalling
    ? normalizeToolCallingMode(settingsStore.toolCallingMode || 'intent')
    : 'off'
}

export function getLastUserMessageContent(activeChat) {
  const messages = Array.isArray(activeChat?.msgs)
    ? activeChat.msgs
    : Array.isArray(activeChat?.messages)
      ? activeChat.messages
      : []
  const lastMsg = [...messages].reverse().find((message) => message?.role === 'user')
  const content = lastMsg?.content

  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content
    .filter((part) => part?.type === 'text')
    .map((part) => String(part?.text || ''))
    .join(' ')
}

export async function prepareChatTools({
  contactsStore,
  settingsStore,
  activeChat,
  selectedMcpServerIds,
  discoverMcpTools,
  makeMsgId
}) {
  const effectiveToolMode = getEffectiveToolCallingMode(settingsStore)
  if (effectiveToolMode === 'off') return emptyToolPreparation()

  try {
    const { getAvailableTools } = await import('../tools/toolRegistry')
    const mcpDiscovery = typeof discoverMcpTools === 'function'
      ? await discoverMcpTools({ serverIds: selectedMcpServerIds })
      : { tools: [], externalExecutors: null }
    const externalExecutors = mcpDiscovery.externalExecutors || null
    let tools = getAvailableTools(settingsStore, activeChat, mcpDiscovery.tools || [])

    if (effectiveToolMode === 'intent' && tools.length > 0) {
      const { selectToolsForIntent } = await import('../tools/selectToolsForIntent')
      tools = selectToolsForIntent(getLastUserMessageContent(activeChat), tools)
    }

    if (tools.length === 0) return emptyToolPreparation(externalExecutors)

    const { useMomentsStore } = await import('../../../stores/moments')
    const { useMusicStore } = await import('../../../stores/music')
    const { usePlannerStore } = await import('../../../stores/planner')
    const { useLivenessStore } = await import('../../../stores/liveness')

    return {
      tools,
      externalExecutors,
      toolContext: {
        contactsStore,
        settingsStore,
        momentsStore: useMomentsStore(),
        musicStore: useMusicStore(),
        plannerStore: usePlannerStore(),
        livenessStore: useLivenessStore(),
        activeChat,
        makeMsgId
      }
    }
  } catch (err) {
    console.warn('[ToolCalling] Failed to resolve tools, proceeding without:', err?.message)
    return emptyToolPreparation()
  }
}
