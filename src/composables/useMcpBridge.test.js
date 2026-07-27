import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMcpBridge } from './useMcpBridge'

const originalFetch = globalThis.fetch
const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')

function setWindowLocation(location) {
  Object.defineProperty(globalThis, 'window', {
    value: { location },
    configurable: true,
    writable: true
  })
}

function restoreWindow() {
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, 'window', originalWindowDescriptor)
    return
  }
  Reflect.deleteProperty(globalThis, 'window')
}

function createSettingsStore(bridgeUrl, overrides = {}) {
  return {
    allowToolCalling: true,
    toolCallingConfig: {
      mcpBridgeEnabled: true,
      mcpBridgeUrl: bridgeUrl,
      mcpServers: [],
      mcpDirectServers: [],
      ...overrides
    },
    ...(overrides.root || {})
  }
}

function createJsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  })
}

afterEach(() => {
  globalThis.fetch = originalFetch
  restoreWindow()
})

describe('useMcpBridge', () => {
  it('routes insecure bridge requests through the same-origin proxy on deployed HTTPS pages', async () => {
    setWindowLocation({
      origin: 'https://aichat.vercel.app',
      hostname: 'aichat.vercel.app',
      protocol: 'https:'
    })

    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        ok: true,
        serverCount: 0,
        connectedCount: 0,
        servers: []
      })
    )
    globalThis.fetch = fetchMock

    const { getBridgeStatus } = useMcpBridge({
      settingsStore: createSettingsStore('http://bridge.example.com/base')
    })

    const status = await getBridgeStatus({ force: true })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/proxy',
      expect.objectContaining({
        method: 'GET',
        headers: {
          'x-target-url': 'http://bridge.example.com/base/status'
        }
      })
    )
    expect(status.reachable).toBe(true)
  })

  it('retries cross-origin bridge requests through the proxy after a browser fetch failure', async () => {
    setWindowLocation({
      origin: 'https://aichat.vercel.app',
      hostname: 'aichat.vercel.app',
      protocol: 'https:'
    })

    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(
        createJsonResponse({
          ok: true,
          serverCount: 1,
          connectedCount: 1,
          servers: []
        })
      )
    globalThis.fetch = fetchMock

    const { getBridgeStatus } = useMcpBridge({
      settingsStore: createSettingsStore('https://bridge.example.com')
    })

    const status = await getBridgeStatus({ force: true })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://bridge.example.com/status',
      expect.objectContaining({
        method: 'GET',
        headers: {}
      })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/proxy',
      expect.objectContaining({
        method: 'GET',
        headers: {
          'x-target-url': 'https://bridge.example.com/status'
        }
      })
    )
    expect(status.reachable).toBe(true)
  })

  it('returns a clearer allowlist error when the proxy blocks the bridge host', async () => {
    setWindowLocation({
      origin: 'https://aichat.vercel.app',
      hostname: 'aichat.vercel.app',
      protocol: 'https:'
    })

    globalThis.fetch = vi.fn().mockResolvedValue(
      createJsonResponse(
        {
          error: 'Target host not in allowlist'
        },
        403
      )
    )

    const { getBridgeStatus } = useMcpBridge({
      settingsStore: createSettingsStore('http://bridge.example.com')
    })

    const status = await getBridgeStatus({ force: true })

    expect(status.reachable).toBe(false)
    expect(status.lastError).toBe('桥接主机 bridge.example.com 未加入 API_PROXY_ALLOWED_HOSTS')
  })

  it('does not include direct servers when conversation MCP ids target other servers', async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock

    const { discoverMcpTools } = useMcpBridge({
      settingsStore: createSettingsStore('', {
        mcpBridgeEnabled: false,
        mcpDirectServers: [
          { id: 'direct_docs', name: 'Docs', url: 'https://mcp.example.com/docs', apiKey: 'secret', enabled: true }
        ]
      })
    })

    const discovery = await discoverMcpTools({ force: true, serverIds: ['bridge_only'] })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(discovery.tools).toEqual([])
    expect(discovery.externalExecutors).toEqual(new Map())
  })

  it('skips all MCP discovery when conversation MCP ids are explicitly empty', async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock

    const { discoverMcpTools } = useMcpBridge({
      settingsStore: createSettingsStore('https://bridge.example.com', {
        mcpBridgeEnabled: true,
        mcpServers: [
          { id: 'bridge_docs', name: 'Docs', transport: 'http', url: 'https://bridge.example.com/docs', enabled: true }
        ],
        mcpDirectServers: [
          { id: 'direct_docs', name: 'Docs', url: 'https://mcp.example.com/docs', apiKey: 'secret', enabled: true }
        ]
      })
    })

    const discovery = await discoverMcpTools({ force: true, serverIds: [] })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(discovery.tools).toEqual([])
    expect(discovery.externalExecutors).toEqual(new Map())
  })

  it('discovers only the selected bridge server tools when conversation MCP ids are set', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(createJsonResponse({ ok: true, servers: [] }))
      .mockResolvedValueOnce(createJsonResponse({ ok: true }))
      .mockResolvedValueOnce(createJsonResponse({
        ok: true,
        tools: [
          { serverId: 'bridge_docs', serverName: 'Docs', name: 'search', description: 'Search', inputSchema: { type: 'object', properties: {} } },
          { serverId: 'bridge_other', serverName: 'Other', name: 'list', description: 'List', inputSchema: { type: 'object', properties: {} } }
        ]
      }))
    globalThis.fetch = fetchMock

    const { discoverMcpTools } = useMcpBridge({
      settingsStore: createSettingsStore('https://bridge.example.com', {
        mcpBridgeEnabled: true,
        notionEnabled: false,
        mcpServers: [
          { id: 'bridge_docs', name: 'Docs', transport: 'http', url: 'https://bridge.example.com/docs', enabled: true },
          { id: 'bridge_other', name: 'Other', transport: 'http', url: 'https://bridge.example.com/other', enabled: true }
        ]
      })
    })

    const discovery = await discoverMcpTools({ force: true, serverIds: ['bridge_docs'] })

    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ id: 'bridge_docs' })
    expect(discovery.tools).toHaveLength(1)
    expect(discovery.tools[0].name).toContain('docs_search')
  })
})
