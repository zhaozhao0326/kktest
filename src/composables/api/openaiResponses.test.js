import { describe, expect, it, vi } from 'vitest'

import {
  buildOpenAIResponsesRequest,
  consumeOpenAIResponsesStream,
  extractOpenAIResponsesNonStreamText,
  resolveOpenAIResponsesUrl
} from './openaiResponses'

function createSSEResponse(events) {
  const text = events.map(e => {
    let lines = ''
    if (e.event) lines += `event: ${e.event}\n`
    lines += `data: ${JSON.stringify(e.data)}\n\n`
    return lines
  }).join('')
  return new Response(text)
}

describe('openaiResponses adapter', () => {
  it('resolves base URLs to /v1/responses', () => {
    expect(resolveOpenAIResponsesUrl('https://api.openai.com')).toBe('https://api.openai.com/v1/responses')
    expect(resolveOpenAIResponsesUrl('https://api.openai.com/v1')).toBe('https://api.openai.com/v1/responses')
    expect(resolveOpenAIResponsesUrl('https://proxy.test/v1/responses')).toBe('https://proxy.test/v1/responses')
    expect(resolveOpenAIResponsesUrl('')).toBe('/v1/responses')
  })

  it('builds request with system as instructions and messages as input', () => {
    const request = buildOpenAIResponsesRequest({
      url: 'https://api.openai.com/v1',
      key: 'test-key',
      model: 'gpt-4o',
      temperature: 0.7,
      maxTokens: 2048
    }, [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' }
    ])

    expect(request.url).toBe('https://api.openai.com/v1/responses')
    expect(request.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-key'
    })
    expect(request.body.model).toBe('gpt-4o')
    expect(request.body.instructions).toBe('You are helpful.')
    expect(request.body.input).toEqual([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' }
    ])
    expect(request.body.temperature).toBe(0.7)
    expect(request.body.max_output_tokens).toBe(2048)
    expect(request.body.stream).toBe(true)
  })

  it('converts tool messages to function_call_output', () => {
    const request = buildOpenAIResponsesRequest({
      model: 'gpt-4o', key: 'k'
    }, [
      { role: 'tool', tool_call_id: 'call_1', content: '{"result": 42}' }
    ])

    expect(request.body.input).toEqual([{
      type: 'function_call_output',
      call_id: 'call_1',
      output: '{"result": 42}'
    }])
  })

  it('includes reasoning effort when configured', () => {
    const request = buildOpenAIResponsesRequest({
      model: 'o1', key: 'k', reasoningEffort: 'high'
    }, [{ role: 'user', content: 'Think' }])

    expect(request.body.reasoning).toEqual({ effort: 'high' })
  })

  it('streams text deltas from response.output_text.delta events', async () => {
    const chunks = []
    const response = createSSEResponse([
      { event: 'response.output_text.delta', data: { type: 'response.output_text.delta', delta: 'Hello' } },
      { event: 'response.output_text.delta', data: { type: 'response.output_text.delta', delta: ' world' } },
      { event: 'response.completed', data: { type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 10, output_tokens: 5 } } } }
    ])

    const result = await consumeOpenAIResponsesStream(response, delta => chunks.push(delta))

    expect(chunks).toEqual(['Hello', ' world'])
    expect(result.emittedChars).toBe(11)
    expect(result.emittedEvents).toBe(2)
    expect(result.finishReason).toBe('stop')
    expect(result.usage).toEqual({ input_tokens: 10, output_tokens: 5 })
  })

  it('captures reasoning summary deltas separately from visible text', async () => {
    const chunks = []
    const onReasoningDelta = vi.fn()
    const response = createSSEResponse([
      { event: 'response.reasoning_summary_text.delta', data: { type: 'response.reasoning_summary_text.delta', delta: '先选择天气工具' } },
      { event: 'response.output_text.delta', data: { type: 'response.output_text.delta', delta: '查询完成' } },
      { event: 'response.completed', data: { type: 'response.completed', response: { status: 'completed' } } }
    ])

    const result = await consumeOpenAIResponsesStream(response, delta => chunks.push(delta), { onReasoningDelta })

    expect(chunks).toEqual(['查询完成'])
    expect(onReasoningDelta).toHaveBeenLastCalledWith('先选择天气工具')
    expect(result.reasoningContent).toBe('先选择天气工具')
  })

  it('accumulates tool calls from streaming events', async () => {
    const response = createSSEResponse([
      { event: 'response.output_item.added', data: { type: 'response.output_item.added', output_index: 0, item: { type: 'function_call', call_id: 'call_1', name: 'get_weather' } } },
      { event: 'response.function_call_arguments.delta', data: { type: 'response.function_call_arguments.delta', output_index: 0, item_id: 'call_1', delta: '{"loc' } },
      { event: 'response.function_call_arguments.delta', data: { type: 'response.function_call_arguments.delta', output_index: 0, item_id: 'call_1', delta: 'ation":"NYC"}' } },
      { event: 'response.completed', data: { type: 'response.completed', response: { status: 'completed' } } }
    ])

    const result = await consumeOpenAIResponsesStream(response, () => {})

    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0].function.name).toBe('get_weather')
    expect(result.toolCalls[0].function.arguments).toBe('{"location":"NYC"}')
  })

  it('extracts non-stream text from output_text field', () => {
    expect(extractOpenAIResponsesNonStreamText({
      output_text: 'Hello world'
    })).toBe('Hello world')

    expect(extractOpenAIResponsesNonStreamText({
      output: [{
        type: 'message',
        content: [{ type: 'output_text', text: 'hello' }]
      }]
    })).toBe('hello')
  })
})
