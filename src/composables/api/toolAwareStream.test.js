import { describe, expect, it, vi } from 'vitest'
import { consumeToolAwareChatCompletionsStream } from './toolAwareStream'

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

describe('toolAwareStream', () => {
  it('collects tool calls and reasoning_content without leaking reasoning to visible output', async () => {
    const response = createStreamResponse([
      sse({
        choices: [{
          delta: {
            reasoning_content: 'private-1',
            tool_calls: [{
              index: 0,
              id: 'call_1',
              type: 'function',
              function: { name: 'write_diary', arguments: '{"content":"今天' }
            }]
          }
        }]
      }),
      sse({
        choices: [{
          delta: {
            reasoning_content: 'private-2',
            tool_calls: [{
              index: 0,
              function: { arguments: '过得很充实"}' }
            }]
          },
          finish_reason: 'tool_calls'
        }]
      }),
      'data: [DONE]\n\n'
    ])
    const onDelta = vi.fn()
    const onReasoningDelta = vi.fn()

    const result = await consumeToolAwareChatCompletionsStream(response, { onDelta, onReasoningDelta })

    expect(onDelta).not.toHaveBeenCalled()
    expect(onReasoningDelta.mock.calls).toEqual([
      ['private-1'],
      ['private-1private-2']
    ])
    expect(result.toolCalls).toEqual([
      {
        id: 'call_1',
        type: 'function',
        function: {
          name: 'write_diary',
          arguments: '{"content":"今天过得很充实"}'
        }
      }
    ])
    expect(result.reasoningContent).toBe('private-1private-2')
    expect(result.filteredReasoningChars).toBeGreaterThan(0)
  })
})
