import { describe, expect, it } from 'vitest'

import {
  API_FORMAT_ANTHROPIC_MESSAGES,
  API_FORMAT_GEMINI_GENERATE_CONTENT,
  API_FORMAT_OPENAI_COMPATIBLE,
  API_FORMAT_OPENAI_RESPONSES,
  createDefaultCacheConfig,
  isOpenAICompatibleFormat,
  normalizeApiFormat,
  normalizeCacheConfig,
  normalizeProviderConfig
} from './providerFormats'

describe('providerFormats', () => {
  it('defaults missing or unknown formats to OpenAI-compatible', () => {
    expect(normalizeApiFormat()).toBe(API_FORMAT_OPENAI_COMPATIBLE)
    expect(normalizeApiFormat('')).toBe(API_FORMAT_OPENAI_COMPATIBLE)
    expect(normalizeApiFormat('made-up')).toBe(API_FORMAT_OPENAI_COMPATIBLE)
  })

  it('normalizes supported provider format aliases', () => {
    expect(normalizeApiFormat('openai')).toBe(API_FORMAT_OPENAI_COMPATIBLE)
    expect(normalizeApiFormat('openai-compatible')).toBe(API_FORMAT_OPENAI_COMPATIBLE)
    expect(normalizeApiFormat('anthropic')).toBe(API_FORMAT_ANTHROPIC_MESSAGES)
    expect(normalizeApiFormat('anthropic-messages')).toBe(API_FORMAT_ANTHROPIC_MESSAGES)
    expect(normalizeApiFormat('gemini')).toBe(API_FORMAT_GEMINI_GENERATE_CONTENT)
    expect(normalizeApiFormat('gemini-generate-content')).toBe(API_FORMAT_GEMINI_GENERATE_CONTENT)
    expect(normalizeApiFormat('openai-responses')).toBe(API_FORMAT_OPENAI_RESPONSES)
    expect(normalizeApiFormat('responses')).toBe(API_FORMAT_OPENAI_RESPONSES)
  })

  it('identifies only OpenAI-compatible configs as tool-call compatible', () => {
    expect(isOpenAICompatibleFormat({ apiFormat: 'openai-compatible' })).toBe(true)
    expect(isOpenAICompatibleFormat({ apiFormat: 'anthropic-messages' })).toBe(false)
    expect(isOpenAICompatibleFormat({ apiFormat: 'gemini-generate-content' })).toBe(false)
    expect(isOpenAICompatibleFormat({})).toBe(true)
  })

  it('normalizes cache configuration with conservative defaults', () => {
    expect(createDefaultCacheConfig()).toEqual({
      enabled: false,
      systemPrompt: true,
      ttl: '5m'
    })

    expect(normalizeCacheConfig({ enabled: true, systemPrompt: false, ttl: '1h' })).toEqual({
      enabled: true,
      systemPrompt: false,
      ttl: '1h'
    })

    // Historical character thresholds are accepted and migrated to the default TTL.
    expect(normalizeCacheConfig({ enabled: true, minChars: -5 })).toEqual({
      enabled: true,
      systemPrompt: true,
      ttl: '5m'
    })
  })

  it('normalizes a whole provider config without dropping base fields', () => {
    const cfg = normalizeProviderConfig({
      id: 'cfg',
      url: 'https://api.anthropic.com',
      apiFormat: 'anthropic',
      customHeadersJson: '{"anthropic-beta":"prompt-caching-2024-07-31"}',
      customBodyJson: '{"metadata":{"source":"app"}}',
      removeBodyParams: ['temperature', 'top_p', 'temperature'],
      cacheConfig: { enabled: true, ttl: '1h' }
    })

    expect(cfg).toMatchObject({
      id: 'cfg',
      url: 'https://api.anthropic.com',
      apiFormat: API_FORMAT_ANTHROPIC_MESSAGES,
      customHeadersJson: '{"anthropic-beta":"prompt-caching-2024-07-31"}',
      customBodyJson: '{"metadata":{"source":"app"}}',
      autoAdaptParameters: true,
      removeBodyParams: ['temperature', 'top_p'],
      cacheConfig: {
        enabled: true,
        systemPrompt: true,
        ttl: '1h'
      }
    })
  })
})
