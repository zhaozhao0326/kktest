import { describe, expect, it } from 'vitest'

import { getModelParameterCompatibility } from './modelParameterCompatibility'

describe('modelParameterCompatibility', () => {
  it.each([
    'claude-opus-4-7',
    'anthropic/claude-opus-4.8',
    'openrouter/anthropic/claude-5-sonnet',
    'claude-sonnet-5',
    'claude-fable-5',
    'claude-sonnet-latest',
    'anthropic.claude-haiku-5-0-v1:0'
  ])('recognizes Claude models with locked sampling parameters: %s', (model) => {
    const compatibility = getModelParameterCompatibility(model)
    expect(compatibility.temperatureSupported).toBe(false)
    expect(compatibility.removedParameters).toEqual(['temperature', 'top_p', 'top_k'])
  })

  it.each([
    'claude-sonnet-4-5',
    'claude-opus-4-1-20250805',
    'claude-opus-4-6',
    'openrouter/anthropic/claude-4.6-sonnet',
    'claude-3-5-sonnet-20241022'
  ])('keeps sampling parameters for older Claude models: %s', (model) => {
    expect(getModelParameterCompatibility(model).removedParameters).toEqual([])
  })

  it.each(['o1', 'openai/o3-mini', 'gpt-5', 'openrouter/openai/gpt-5.2-chat'])(
    'recognizes common OpenAI reasoning models: %s',
    (model) => {
      const compatibility = getModelParameterCompatibility(model)
      expect(compatibility.temperatureSupported).toBe(false)
      expect(compatibility.removedParameters).toContain('top_p')
    }
  )

  it('does not alter ordinary models', () => {
    expect(getModelParameterCompatibility('gpt-4o')).toMatchObject({
      removedParameters: [],
      temperatureSupported: true
    })
  })
})
