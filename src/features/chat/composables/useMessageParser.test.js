import { describe, expect, it } from 'vitest'
import { useMessageParser } from './useMessageParser'

function createParser(messages, options = {}) {
  return useMessageParser({
    getMessages: () => messages,
    getStickerUrl: () => '',
    showTimestamps: () => false,
    allowAIStickers: () => true,
    allowAITransfer: () => true,
    allowAIGift: () => true,
    allowAIVoice: () => true,
    allowAICall: () => true,
    allowAIMockImage: () => true,
    allowAIMusicRecommend: () => true,
    allowAIMeet: () => true,
    showToolLog: () => !!options.showToolLog,
    showReasoning: () => !!options.showReasoning,
    timestampGapMs: 0,
    getAnimateMsgId: () => null,
    isGroupChat: () => !!options.isGroupChat,
    getGroupMembers: () => options.groupMembers || [],
    showChatAvatars: () => false,
    getContactAvatar: () => null,
    getUserAvatar: () => null,
    showNarrations: () => true,
    getMockImagePlaceholder: () => '',
    getActiveContactId: () => options.activeContactId || ''
  })
}

describe('useMessageParser', () => {
  it('binds direct assistant voice blocks to the active chat contact', () => {
    const { blocks } = createParser([
      {
        id: 'msg-1',
        role: 'assistant',
        content: '(voice:当前聊天角色语音)'
      }
    ], {
      activeContactId: 'contact-direct-1'
    })

    expect(blocks.value).toMatchObject([
      {
        type: 'voice',
        msgId: 'msg-1',
        contactId: 'contact-direct-1',
        text: '当前聊天角色语音'
      }
    ])
  })

  it('preserves contactId on parsed voice blocks', () => {
    const { blocks } = createParser([
      {
        id: 'msg-1',
        role: 'assistant',
        contactId: 'contact-1',
        content: '(voice:收藏里的语音)'
      }
    ])

    expect(blocks.value).toMatchObject([
      {
        type: 'voice',
        msgId: 'msg-1',
        contactId: 'contact-1',
        text: '收藏里的语音'
      }
    ])
  })

  it('binds group assistant voice blocks to the sender contact', () => {
    const { blocks } = createParser([
      {
        id: 'msg-1',
        role: 'assistant',
        senderId: 'member-1',
        content: '(voice:群聊角色语音)'
      }
    ], {
      isGroupChat: true,
      groupMembers: [
        { id: 'member-1', contactId: 'contact-role-1', name: '角色一' }
      ]
    })

    expect(blocks.value).toMatchObject([
      {
        type: 'voice',
        msgId: 'msg-1',
        contactId: 'contact-role-1',
        text: '群聊角色语音'
      }
    ])
  })

  it('prefers sourceMsgId for block msgId when rendering preview messages', () => {
    const { blocks } = createParser([
      {
        id: 'preview-msg-1',
        sourceMsgId: 'source-msg-1',
        role: 'assistant',
        content: '预览气泡'
      }
    ])

    expect(blocks.value).toMatchObject([
      {
        type: 'bubble',
        msgId: 'source-msg-1',
        text: '预览气泡'
      }
    ])
  })

  it('prefers sourceMsgId when preview messages use synthetic ids', () => {
    const { blocks } = createParser([
      {
        id: 'preview-msg-1',
        sourceMsgId: 'msg-1',
        role: 'assistant',
        content: '预览消息'
      }
    ])

    expect(blocks.value).toMatchObject([
      {
        type: 'bubble',
        msgId: 'msg-1',
        text: '预览消息'
      }
    ])
  })

  it('normalizes and truncates long reply preview text', () => {
    const longReply = `第一行\n第二行 ${'很长的引用'.repeat(40)}`
    const { blocks } = createParser([
      {
        id: 'msg-1',
        role: 'assistant',
        content: '收到',
        replyToText: longReply
      }
    ])

    expect(blocks.value).toHaveLength(1)
    expect(blocks.value[0].replyText).toContain('第一行 第二行')
    expect(blocks.value[0].replyText).not.toContain('\n')
    expect(blocks.value[0].replyText.endsWith('…')).toBe(true)
    expect(blocks.value[0].replyText.length).toBeLessThanOrEqual(141)
  })

  it('does not render empty assistant placeholders as chat bubbles', () => {
    const { blocks } = createParser([
      {
        id: 'msg-1',
        role: 'assistant',
        content: ''
      }
    ])

    expect(blocks.value).toEqual([])
  })

  it('renders tool log cards before the assistant bubble when enabled', () => {
    const { blocks } = createParser([
      {
        id: 'msg-1',
        role: 'assistant',
        content: '已经帮你处理好了',
        toolLogs: [
          {
            source: 'mcp',
            sourceLabel: 'MCP',
            success: true,
            displayName: 'create_page',
            subtitle: 'Notion · create_page',
            summary: '已返回 pageId',
            argsPreview: '{\n  "title": "周计划"\n}',
            resultPreview: '{\n  "pageId": "page_1"\n}',
            durationLabel: '32 ms',
            round: 1
          }
        ]
      }
    ], {
      showToolLog: true
    })

    expect(blocks.value).toHaveLength(2)
    expect(blocks.value[0]).toMatchObject({
      type: 'toolLog',
      msgId: 'msg-1',
      title: 'create_page',
      summary: '已返回 pageId',
      durationLabel: '32 ms'
    })
    expect(blocks.value[1]).toMatchObject({
      type: 'bubble',
      msgId: 'msg-1',
      text: '已经帮你处理好了'
    })
  })

  it('hides tool log cards when the setting is disabled', () => {
    const { blocks } = createParser([
      {
        id: 'msg-1',
        role: 'assistant',
        content: '只显示正文',
        toolLogs: [
          {
            source: 'internal',
            sourceLabel: '内置工具',
            success: true,
            displayName: '创建日程事件',
            summary: '已返回 eventId',
            round: 1
          }
        ]
      }
    ])

    expect(blocks.value).toHaveLength(1)
    expect(blocks.value[0]).toMatchObject({
      type: 'bubble',
      text: '只显示正文'
    })
  })

  it('renders reasoning before tool calls and keeps it hidden by default', () => {
    const messages = [
      {
        id: 'msg-reasoning-1',
        role: 'assistant',
        content: '已经查询完成',
        reasoningLogs: [
          { content: '用户想测试联网搜索，我需要先选择搜索工具。', round: 1 }
        ],
        reasoningStreaming: true,
        reasoningStreamingRound: 1,
        toolLogs: [
          { displayName: 'WebSearch', success: true, round: 1 }
        ]
      }
    ]

    const hiddenParser = createParser(messages, { showToolLog: true })
    expect(hiddenParser.blocks.value.map(block => block.type)).toEqual(['toolLog', 'bubble'])

    const visibleParser = createParser(messages, { showToolLog: true, showReasoning: true })
    expect(visibleParser.blocks.value.map(block => block.type)).toEqual(['reasoning', 'toolLog', 'bubble'])
    expect(visibleParser.blocks.value[0]).toMatchObject({
      content: '用户想测试联网搜索，我需要先选择搜索工具。',
      round: 1,
      streaming: true
    })
  })

  it('marks only the active reasoning round as streaming', () => {
    const { blocks } = createParser([
      {
        id: 'msg-reasoning-stream',
        role: 'assistant',
        content: '',
        reasoningLogs: [
          { content: '第一轮思考', round: 1 },
          { content: '第二轮思考中', round: 2 }
        ],
        reasoningStreaming: true,
        reasoningStreamingRound: 2
      }
    ], { showReasoning: true })

    expect(blocks.value.map(block => block.streaming)).toEqual([false, true])
  })

  it('prefers persisted gift snapshots over live catalog lookup when rendering gift cards', () => {
    const { blocks } = createParser([
      {
        id: 'msg-gift-1',
        role: 'user',
        content: '(gift:玫瑰:送给你)',
        giftPartSnapshots: {
          0: {
            id: 'gift_custom_1',
            name: '演唱会门票',
            description: '去年一起看的那场',
            price: 520,
            image: 'data:image/png;base64,abc'
          }
        }
      }
    ])

    expect(blocks.value).toHaveLength(1)
    expect(blocks.value[0]).toMatchObject({
      type: 'gift',
      item: '演唱会门票',
      description: '去年一起看的那场',
      price: 520,
      imageUrl: 'data:image/png;base64,abc',
      message: '送给你'
    })
  })
})
