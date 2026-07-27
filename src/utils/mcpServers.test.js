import { describe, expect, it } from 'vitest'
import {
  describeMcpServerSelection,
  listAvailableMcpServers,
  normalizeMcpServerIds,
  resolveDirectMcpServerIds,
  resolveGroupMultiMcpServerIds,
  resolveGroupSingleMcpServerIds
} from './mcpServers'

describe('mcpServers helpers', () => {
  it('normalizes server ids by trimming empties and removing duplicates', () => {
    expect(normalizeMcpServerIds([' a ', '', null, 'b', 'a'])).toEqual(['a', 'b'])
  })

  it('describes selections with configured server names', () => {
    expect(describeMcpServerSelection(['srv_a', 'srv_b'], [
      { id: 'srv_a', name: 'Filesystem' },
      { id: 'srv_b', name: 'Calendar' }
    ])).toBe('Filesystem、Calendar')

    expect(describeMcpServerSelection([], [], {
      emptyLabel: '全部已启用服务器'
    })).toBe('全部已启用服务器')
  })

  it('lists managed Notion and direct MCP servers even when local bridge is disabled', () => {
    expect(listAvailableMcpServers({
      mcpBridgeEnabled: false,
      notionEnabled: true,
      mcpServers: [
        { id: 'bridge_docs', name: 'Bridge Docs', transport: 'stdio', enabled: true }
      ],
      mcpDirectServers: [
        { id: 'direct_firecrawl', name: 'Firecrawl', url: 'https://mcp.example.com/firecrawl', enabled: true }
      ]
    }).map((server) => ({ id: server.id, name: server.name, source: server.source }))).toEqual([
      { id: 'managed_notion', name: 'Notion', source: 'notion' },
      { id: 'direct_firecrawl', name: 'Firecrawl', source: 'direct' }
    ])
  })

  it('adds bridge MCP servers only when the local bridge is enabled', () => {
    expect(listAvailableMcpServers({
      mcpBridgeEnabled: true,
      notionEnabled: false,
      mcpServers: [
        { id: 'bridge_docs', name: 'Bridge Docs', transport: 'stdio', enabled: true }
      ],
      mcpDirectServers: []
    }).map((server) => ({ id: server.id, source: server.source }))).toEqual([
      { id: 'bridge_docs', source: 'bridge' }
    ])
  })

  it('uses explicit contact selections and otherwise resolves empty selections to no MCP', () => {
    expect(resolveDirectMcpServerIds({ mcpServerIds: ['srv_a'] })).toEqual(['srv_a'])
    expect(resolveDirectMcpServerIds({ mcpServerIds: [] })).toEqual([])
  })

  it('resolves group multi selections with member override and group fallback', () => {
    const group = { mcpServerIds: ['srv_group'] }
    expect(resolveGroupMultiMcpServerIds(group, { mcpServerIds: ['srv_member'] })).toEqual(['srv_member'])
    expect(resolveGroupMultiMcpServerIds(group, { mcpServerIds: [] })).toEqual(['srv_group'])
    expect(resolveGroupMultiMcpServerIds({ mcpServerIds: [] }, { mcpServerIds: [] })).toEqual([])
  })

  it('merges explicit selections for single-api groups', () => {
    expect(resolveGroupSingleMcpServerIds({
      mcpServerIds: ['srv_group'],
      members: [
        { mcpServerIds: [] },
        { mcpServerIds: ['srv_member'] }
      ]
    })).toEqual(['srv_group', 'srv_member'])

    expect(resolveGroupSingleMcpServerIds({
      mcpServerIds: [],
      members: [
        { mcpServerIds: ['srv_a'] },
        { mcpServerIds: ['srv_b', 'srv_a'] }
      ]
    })).toEqual(['srv_a', 'srv_b'])

    expect(resolveGroupSingleMcpServerIds({
      mcpServerIds: [],
      members: [{ mcpServerIds: [] }]
    })).toEqual([])
  })
})
