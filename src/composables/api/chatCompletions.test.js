import { describe, expect, it } from 'vitest'
import { buildChatCompletionPayload } from './chatCompletions'

describe('chatCompletions', () => {
  it('uses config maxTokens when present', () => {
    const payload = buildChatCompletionPayload({
      model: 'gpt-test',
      maxTokens: 2048
    }, [{ role: 'user', content: 'hi' }])

    expect(payload.max_tokens).toBe(2048)
  })

  it('falls back to request max_tokens when config maxTokens is absent', () => {
    const payload = buildChatCompletionPayload({
      model: 'gpt-test',
      maxTokens: null
    }, [{ role: 'user', content: 'hi' }], {
      max_tokens: 256
    })

    expect(payload.max_tokens).toBe(256)
  })

  it('omits max_tokens when neither config nor request provides it', () => {
    const payload = buildChatCompletionPayload({
      model: 'gpt-test',
      maxTokens: null
    }, [{ role: 'user', content: 'hi' }])

    expect(Object.prototype.hasOwnProperty.call(payload, 'max_tokens')).toBe(false)
  })

  it('omits temperature when the setting is blank instead of coercing it to zero', () => {
    const nullPayload = buildChatCompletionPayload({
      model: 'gpt-test',
      temperature: null
    }, [{ role: 'user', content: 'hi' }])
    const blankPayload = buildChatCompletionPayload({
      model: 'gpt-test',
      temperature: ''
    }, [{ role: 'user', content: 'hi' }])
    const zeroPayload = buildChatCompletionPayload({
      model: 'gpt-test',
      temperature: 0
    }, [{ role: 'user', content: 'hi' }])

    expect(nullPayload).not.toHaveProperty('temperature')
    expect(blankPayload).not.toHaveProperty('temperature')
    expect(zeroPayload.temperature).toBe(0)
  })

  it('adds reasoning_effort only when configured', () => {
    const payload = buildChatCompletionPayload({
      model: 'gpt-test',
      maxTokens: null,
      reasoningEffort: 'medium'
    }, [{ role: 'user', content: 'hi' }])

    expect(payload.reasoning_effort).toBe('medium')

    const defaultPayload = buildChatCompletionPayload({
      model: 'gpt-test',
      maxTokens: null,
      reasoningEffort: ''
    }, [{ role: 'user', content: 'hi' }])

    expect(Object.prototype.hasOwnProperty.call(defaultPayload, 'reasoning_effort')).toBe(false)
  })
})
