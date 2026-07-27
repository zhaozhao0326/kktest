import { describe, expect, it, vi } from 'vitest'
import { executeToolCalls } from './toolCallExecutor'

describe('toolCallExecutor', () => {
  it('returns internal tool messages together with renderable tool logs', async () => {
    const result = await executeToolCalls([
      {
        id: 'call_1',
        function: {
          name: 'create_event',
          arguments: JSON.stringify({
            title: '读书提醒',
            start_date: '2026-04-06'
          })
        }
      }
    ], {
      plannerStore: {
        addEvent(payload) {
          return { id: `evt_${payload.title}` }
        }
      }
    })

    expect(result.messages).toHaveLength(1)
    expect(result.messages[0]).toMatchObject({
      role: 'tool',
      tool_call_id: 'call_1',
      name: 'create_event'
    })
    expect(JSON.parse(result.messages[0].content)).toEqual({
      success: true,
      result: { eventId: 'evt_读书提醒' }
    })

    expect(result.logs).toHaveLength(1)
    expect(result.logs[0]).toMatchObject({
      source: 'internal',
      sourceLabel: '内置工具',
      success: true,
      toolName: 'create_event',
      subtitle: 'create_event'
    })
    expect(result.logs[0].summary).toContain('eventId')
    expect(result.logs[0].argsPreview).toContain('读书提醒')
  })

  it('uses MCP executor metadata when building failed tool logs', async () => {
    const result = await executeToolCalls([
      {
        id: 'call_2',
        function: {
          name: 'mcp_notion_create_page',
          arguments: JSON.stringify({
            title: '周计划'
          })
        }
      }
    ], {}, new Map([
      ['mcp_notion_create_page', {
        execute: async () => {
          throw new Error('HTTP 401')
        },
        meta: {
          source: 'mcp',
          serverName: 'Notion',
          originalName: 'create_page',
          displayName: 'create_page'
        }
      }]
    ]))

    expect(result.messages).toHaveLength(1)
    expect(JSON.parse(result.messages[0].content)).toEqual({
      success: false,
      error: 'HTTP 401'
    })

    expect(result.logs).toHaveLength(1)
    expect(result.logs[0]).toMatchObject({
      source: 'mcp',
      sourceLabel: 'MCP',
      success: false
    })
    expect(result.logs[0].displayName).toBe('create_page')
    expect(result.logs[0].subtitle).toContain('Notion')
    expect(result.logs[0].errorText).toBe('HTTP 401')
  })

  it('writes diary entries as user-view records and keeps assistant provenance', async () => {
    const plannerStore = {
      addDiaryEntry: vi.fn((payload) => ({ id: 'diary_1', ...payload }))
    }

    const result = await executeToolCalls([
      {
        id: 'call_3',
        function: {
          name: 'write_diary',
          arguments: JSON.stringify({
            content: '今天和朋友去吃了火锅，心情很好。',
            mood: '开心'
          })
        }
      }
    ], {
      plannerStore,
      activeChat: { id: 'contact_1' }
    })

    expect(plannerStore.addDiaryEntry).toHaveBeenCalledWith(expect.objectContaining({
      content: '今天和朋友去吃了火锅，心情很好。',
      mood: '开心',
      shareWithAI: true,
      source: 'assistant',
      sourceChatId: 'contact_1',
      sourceContactId: 'contact_1'
    }))
    expect(JSON.parse(result.messages[0].content)).toEqual({
      success: true,
      result: { diaryId: 'diary_1' }
    })
  })

  it('rejects diary entries that are clearly written from the assistant perspective', async () => {
    const plannerStore = {
      addDiaryEntry: vi.fn()
    }

    const result = await executeToolCalls([
      {
        id: 'call_4',
        function: {
          name: 'write_diary',
          arguments: JSON.stringify({
            content: '作为AI，我今天又陪用户聊了很久。'
          })
        }
      }
    ], {
      plannerStore,
      activeChat: { id: 'contact_1' }
    })

    expect(plannerStore.addDiaryEntry).not.toHaveBeenCalled()
    expect(JSON.parse(result.messages[0].content)).toEqual({
      success: false,
      error: '日记必须以用户视角记录，不能使用AI或角色视角'
    })
  })
})
