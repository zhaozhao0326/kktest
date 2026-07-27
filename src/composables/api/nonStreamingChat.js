/**
 * Non-streaming one-shot chat completion routed through the provider abstraction.
 *
 * Background/auxiliary LLM calls (character schedule generation, liveness decision,
 * summaries…) should use this instead of hand-rolling `fetch(url + '/chat/completions')`,
 * so Anthropic / Gemini / OpenAI-Responses configs work the same as OpenAI-compatible ones.
 */
import {
  buildProviderChatPayload,
  buildProviderNonStreamingPayload,
  extractProviderNonStreamText,
  fetchProviderChat,
  readProviderChatError
} from './providerRequest'

/**
 * @param {object} cfg - API config (url/key/model/apiFormat/temperature/maxTokens…)
 * @param {Array<{role: string, content: any}>} messages
 * @param {object} [options]
 * @param {number} [options.temperature] - overrides cfg.temperature for this call
 * @param {number} [options.maxTokens] - lower-priority than cfg.maxTokens (same rule as chat)
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{content: string, data: any, url: string}>}
 * @throws {Error} on non-2xx responses, with the provider-specific error message
 */
export async function requestNonStreamingChatText(cfg, messages, options = {}) {
  const { temperature, maxTokens, max_tokens: maxTokensSnake, signal } = options
  const effectiveCfg = temperature === undefined || temperature === null
    ? cfg
    : { ...cfg, temperature }

  const streamingPayload = buildProviderChatPayload(effectiveCfg, messages, {
    maxTokens: maxTokens ?? maxTokensSnake
  })
  const payload = buildProviderNonStreamingPayload(effectiveCfg, streamingPayload)

  const { request, response } = await fetchProviderChat(
    effectiveCfg,
    payload,
    signal ? { signal } : {}
  )
  if (!response.ok) {
    throw new Error(await readProviderChatError(effectiveCfg, response))
  }

  const data = await response.json()
  return {
    content: extractProviderNonStreamText(effectiveCfg, data),
    data,
    url: request?.targetUrl || request?.url || ''
  }
}
