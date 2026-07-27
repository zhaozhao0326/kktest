import { describe, expect, it, vi } from 'vitest'
import { consumeChatCompletionsStream } from './stream'

function sse(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`
}

function createStreamResponse(chunks) {
  const encoder = new TextEncoder()
  return new Response(new ReadableStream({
    start(controller) {
      chunks.forEach(chunk => controller.enqueue(encoder.encode(chunk)))
      controller.close()
    }
  }))
}

describe('stream', () => {
  it('keeps reasoning_content out of visible deltas', async () => {
    const response = createStreamResponse([
      sse({ choices: [{ delta: { reasoning_content: 'private reasoning' } }] }),
      sse({ choices: [{ delta: { content: '你好' }, finish_reason: 'stop' }] }),
      'data: [DONE]\n\n'
    ])
    const onDelta = vi.fn()
    const onReasoningDelta = vi.fn()

    const result = await consumeChatCompletionsStream(response, onDelta, { onReasoningDelta })

    expect(onDelta.mock.calls).toEqual([['你好']])
    expect(onReasoningDelta).toHaveBeenLastCalledWith('private reasoning')
    expect(result.emittedChars).toBe(2)
    expect(result.filteredReasoningChars).toBeGreaterThan(0)
    expect(result.reasoningContent).toBe('private reasoning')
  })

  it('waits through fragmented think tags before emitting the final answer', async () => {
    const response = createStreamResponse([
      sse({ choices: [{ delta: { content: '<thi' } }] }),
      sse({ choices: [{ delta: { content: 'nk>secret' } }] }),
      sse({ choices: [{ delta: { content: '</think>答案' }, finish_reason: 'stop' }] }),
      'data: [DONE]\n\n'
    ])
    const onDelta = vi.fn()
    const onReasoningDelta = vi.fn()

    const result = await consumeChatCompletionsStream(response, onDelta, { onReasoningDelta })

    expect(onDelta.mock.calls).toEqual([['答案']])
    expect(onReasoningDelta).toHaveBeenLastCalledWith('secret')
    expect(result.emittedChars).toBe(2)
    expect(result.filteredReasoningChars).toBeGreaterThan(0)
    expect(result.reasoningContent).toBe('secret')
  })

  it('suppresses labelled chain-of-thought until the final answer starts', async () => {
    const response = createStreamResponse([
      sse({ choices: [{ delta: { content: 'Tho' } }] }),
      sse({ choices: [{ delta: { content: 'ught: private reasoning' } }] }),
      sse({ choices: [{ delta: { content: '\n\nFinal answer: 你好' }, finish_reason: 'stop' }] }),
      'data: [DONE]\n\n'
    ])
    const onDelta = vi.fn()

    const result = await consumeChatCompletionsStream(response, onDelta)

    expect(onDelta.mock.calls).toEqual([['你好']])
    expect(result.emittedChars).toBe(2)
    expect(result.filteredReasoningChars).toBeGreaterThan(0)
  })
})
