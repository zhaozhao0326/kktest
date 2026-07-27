import { describe, expect, it, vi } from 'vitest'
import {
  cleanReasoningContent,
  createReasoningContentFilter,
  extractReasoningTextFromChoice,
  extractVisibleTextFromContent
} from './reasoningContent'

describe('reasoningContent', () => {
  it('removes tagged reasoning blocks from completed text', () => {
    const result = cleanReasoningContent('<think>We need to reason privately.</think>\n你好')

    expect(result.text).toBe('你好')
    expect(result.reasoningContent).toBe('We need to reason privately.')
    expect(result.removedChars).toBeGreaterThan(0)
  })

  it('removes leading reasoning labels before final answer', () => {
    const result = cleanReasoningContent('Thought: I should not reveal this.\n\nFinal answer: 你好')

    expect(result.text).toBe('你好')
    expect(result.removedChars).toBeGreaterThan(0)
  })

  it('filters streamed think tags across chunk boundaries', () => {
    const onFiltered = vi.fn()
    const filter = createReasoningContentFilter({ onFiltered })

    expect(filter.push('开头 <thi')).toBe('开头 ')
    expect(filter.push('nk>secret')).toBe('')
    expect(filter.push('</think> 结尾')).toBe(' 结尾')
    expect(filter.flush()).toBe('')
    expect(filter.getRemovedChars()).toBeGreaterThan(0)
    expect(filter.getReasoningText()).toBe('secret')
    expect(onFiltered).toHaveBeenCalled()
  })

  it('keeps visible content while extracting reasoning fields separately', () => {
    const choice = {
      delta: {
        reasoning_content: 'private',
        content: [{ type: 'text', text: 'hello' }]
      }
    }

    expect(extractVisibleTextFromContent(choice.delta.content)).toBe('hello')
    expect(extractReasoningTextFromChoice(choice)).toBe('private')
  })
})
