import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMcpDirectConnect } from './useMcpDirectConnect'

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

function createJsonRpcResponse(result, status = 200, headers = {}) {
  return new Response(JSON.stringify({
    jsonrpc: '2.0',
    id: 'test',
    result
  }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  })
}

function createJsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  })
}

function createSseResponse(messages, status = 200, headers = {}) {
  const body = messages
    .map((message) => {
      const payload = typeof message === 'string' ? message : JSON.stringify(message)
      return `data: ${payload}\n\n`
    })
    .join('')

  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/event-stream',
      ...headers
    }
  })
}

afterEach(() => {
  globalThis.fetch = originalFetch
  restoreWindow()
})

describe('useMcpDirectConnect', () => {
  it('uses apiKey as a bearer Authorization header when discovering tools', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(createJsonRpcResponse({}))
      .mockResolvedValueOnce(new Response('', { status: 202 }))
      .mockResolvedValueOnce(createJsonRpcResponse({
        tools: [
          {
            name: 'search',
            description: 'Search docs',
            inputSchema: { type: 'object', properties: {} }
          }
        ]
      }))
    globalThis.fetch = fetchMock

    const settingsStore = {
      toolCallingConfig: {
        notionEnabled: false,
        mcpDirectServers: [
          { id: 'direct_docs', name: 'Docs', url: 'https://mcp.example.com/docs', apiKey: 'secret', enabled: true }
        ]
      }
    }

    const { discoverDirectTools } = useMcpDirectConnect({ settingsStore })
    const result = await discoverDirectTools({ force: true })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://mcp.example.com/docs',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer secret'
        })
      })
    )
    expect(result.tools).toHaveLength(1)
  })

  it('routes deployed cross-origin HTTPS direct servers through /api/mcp-proxy', async () => {
    setWindowLocation({
      origin: 'https://aichat.vercel.app',
      hostname: 'aichat.vercel.app',
      protocol: 'https:'
    })

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(createJsonRpcResponse({}))
      .mockResolvedValueOnce(new Response('', { status: 202 }))
      .mockResolvedValueOnce(createJsonRpcResponse({ tools: [] }))
    globalThis.fetch = fetchMock

    const settingsStore = {
      toolCallingConfig: {
        notionEnabled: false,
        mcpDirectServers: [
          { id: 'direct_docs', name: 'Docs', url: 'https://mcp.example.com/docs', apiKey: 'secret', enabled: true }
        ]
      }
    }

    const { discoverDirectTools } = useMcpDirectConnect({ settingsStore })
    await discoverDirectTools({ force: true })

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/mcp-proxy',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-mcp-url': 'https://mcp.example.com/docs',
          authorization: 'Bearer secret'
        })
      })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/mcp-proxy',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-mcp-url': 'https://mcp.example.com/docs',
          authorization: 'Bearer secret'
        })
      })
    )
  })

  it('skips direct discovery when selected server ids do not match', async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock

    const settingsStore = {
      toolCallingConfig: {
        notionEnabled: false,
        mcpDirectServers: [
          { id: 'direct_docs', name: 'Docs', url: 'https://mcp.example.com/docs', apiKey: 'secret', enabled: true }
        ]
      }
    }

    const { discoverDirectTools } = useMcpDirectConnect({ settingsStore })
    const result = await discoverDirectTools({ force: true, serverIds: ['bridge_only'] })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.tools).toEqual([])
    expect(result.externalExecutors).toEqual(new Map())
  })

  it('skips direct discovery when selected server ids are explicitly empty', async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock

    const settingsStore = {
      toolCallingConfig: {
        notionEnabled: true,
        mcpDirectServers: [
          { id: 'direct_docs', name: 'Docs', url: 'https://mcp.example.com/docs', apiKey: 'secret', enabled: true }
        ]
      }
    }

    const { discoverDirectTools } = useMcpDirectConnect({ settingsStore })
    const result = await discoverDirectTools({ force: true, serverIds: [] })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.tools).toEqual([])
    expect(result.externalExecutors).toEqual(new Map())
  })

  it('discovers the managed notion server when connected', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(createJsonResponse({
        ok: true,
        supported: true,
        connected: true
      }))
      .mockResolvedValueOnce(createJsonRpcResponse({}, 200, {
        'Mcp-Session-Id': 'notion-session-1',
        'Mcp-Protocol-Version': '2024-11-05'
      }))
      .mockResolvedValueOnce(new Response('', {
        status: 202
      }))
      .mockResolvedValueOnce(createJsonRpcResponse({
        tools: [
          {
            name: 'notion_search',
            description: 'Search Notion',
            inputSchema: { type: 'object', properties: {} }
          }
        ]
      }))
    globalThis.fetch = fetchMock

    const settingsStore = {
      toolCallingConfig: {
        notionEnabled: true,
        mcpDirectServers: []
      }
    }

    const { discoverDirectTools } = useMcpDirectConnect({ settingsStore })
    const result = await discoverDirectTools({ force: true })

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/notion?action=status',
      expect.objectContaining({
        method: 'GET',
        credentials: 'include'
      })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/notion?action=mcp',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin'
      })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/notion?action=mcp',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        headers: expect.objectContaining({
          'mcp-session-id': 'notion-session-1',
          'mcp-protocol-version': '2024-11-05'
        })
      })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      '/api/notion?action=mcp',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        headers: expect.objectContaining({
          'mcp-session-id': 'notion-session-1',
          'mcp-protocol-version': '2024-11-05'
        })
      })
    )
    expect(result.tools).toHaveLength(1)
  })

  it('parses SSE tool discovery responses from the managed notion server', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(createJsonResponse({
        ok: true,
        supported: true,
        connected: true
      }))
      .mockResolvedValueOnce(createJsonRpcResponse({}, 200, {
        'Mcp-Session-Id': 'notion-session-1',
        'Mcp-Protocol-Version': '2024-11-05'
      }))
      .mockResolvedValueOnce(new Response('', {
        status: 202
      }))
      .mockResolvedValueOnce(createSseResponse([
        { jsonrpc: '2.0', method: 'notifications/message', params: { level: 'info' } },
        {
          jsonrpc: '2.0',
          id: 'server-generated-id',
          result: {
            tools: [
              {
                name: 'notion_search',
                description: 'Search Notion',
                inputSchema: { type: 'object', properties: {} }
              }
            ]
          }
        }
      ]))
    globalThis.fetch = fetchMock

    const settingsStore = {
      toolCallingConfig: {
        notionEnabled: true,
        mcpDirectServers: []
      }
    }

    const { discoverDirectTools } = useMcpDirectConnect({ settingsStore })
    const result = await discoverDirectTools({ force: true })

    expect(result.tools).toHaveLength(1)
    expect(result.tools[0].description).toBe('Search Notion')
    expect(result.tools[0].name).toContain('notion_search')
  })
})
