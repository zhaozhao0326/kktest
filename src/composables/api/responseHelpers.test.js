import { describe, expect, it, vi } from 'vitest'
import {
  shouldAddReplyFormatPrompt,
  createStreamChunkBatcher,
  createStreamValueBatcher,
  applyForumOnlyPlaceholder
} from './responseHelpers'

describe('responseHelpers', () => {
  it('detects quote format prompt coverage', () => {
    expect(shouldAddReplyFormatPrompt('plain output')).toBe(true)
    expect(shouldAddReplyFormatPrompt('[quote: xxx]')).toBe(false)
  })

  it('batches stream chunks and computes display content', () => {
    const msg = { content: '', displayContent: '' }
    const chunks = []
    const batcher = createStreamChunkBatcher(msg, (value) => chunks.push(value), (content) => `display:${content}`)

    batcher.push('a')
    batcher.push('b')
    batcher.flushNow()

    expect(msg.content).toBe('ab')
    expect(msg.displayContent).toBe('display:ab')
    expect(chunks[chunks.length - 1]).toBe('display:ab')
  })

  it('touches the active chat message array when stream content is flushed', () => {
    const msg = { id: 'msg-1', content: '', displayContent: '' }
    const activeChat = {
      msgs: [msg]
    }
    const splice = vi.spyOn(activeChat.msgs, 'splice')
    const batcher = createStreamChunkBatcher(msg, null, (content) => content, { activeChat })

    batcher.push('hello')
    batcher.flushNow()

    expect(splice).toHaveBeenCalledWith(0, 1, msg)
    expect(activeChat.msgs[0].content).toBe('hello')
  })

  it('batches streaming values by keeping the latest snapshot', () => {
    const values = []
    const batcher = createStreamValueBatcher(value => values.push(value))

    batcher.push('第一段')
    batcher.push('第一段第二段')
    batcher.flushNow()

    expect(values).toEqual(['第一段第二段'])
  })

  it('marks forum-only placeholder when content is empty after strip', () => {
    const msg = { content: '<post></post>', displayContent: '' }
    const parsed = { posts: 1 }

    const forumOnly = applyForumOnlyPlaceholder(msg, parsed, {
      stripForumBlocks: () => '',
      trimText: (value) => String(value || '').trim(),
      placeholder: 'placeholder'
    })

    expect(forumOnly).toBe(true)
    expect(msg.displayContent).toBe('placeholder')
    expect(msg.forumOnly).toBe(true)
  })
})
