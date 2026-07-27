import { normalizeApiKey } from '../../utils/httpHeaders'
import { normalizeRemovedRequestParameters } from './requestCustomization'

export const API_FORMAT_OPENAI_COMPATIBLE = 'openai-compatible'
export const API_FORMAT_OPENAI_RESPONSES = 'openai-responses'
export const API_FORMAT_ANTHROPIC_MESSAGES = 'anthropic-messages'
export const API_FORMAT_GEMINI_GENERATE_CONTENT = 'gemini-generate-content'

const API_FORMAT_ALIASES = Object.freeze({
  'openai': API_FORMAT_OPENAI_COMPATIBLE,
  'openai-compatible': API_FORMAT_OPENAI_COMPATIBLE,
  'openai_compatible': API_FORMAT_OPENAI_COMPATIBLE,
  'chat-completions': API_FORMAT_OPENAI_COMPATIBLE,
  'chat_completions': API_FORMAT_OPENAI_COMPATIBLE,
  'openai-responses': API_FORMAT_OPENAI_RESPONSES,
  'openai_responses': API_FORMAT_OPENAI_RESPONSES,
  'responses': API_FORMAT_OPENAI_RESPONSES,
  'anthropic': API_FORMAT_ANTHROPIC_MESSAGES,
  'anthropic-messages': API_FORMAT_ANTHROPIC_MESSAGES,
  'anthropic_messages': API_FORMAT_ANTHROPIC_MESSAGES,
  'claude': API_FORMAT_ANTHROPIC_MESSAGES,
  'gemini': API_FORMAT_GEMINI_GENERATE_CONTENT,
  'gemini-generate-content': API_FORMAT_GEMINI_GENERATE_CONTENT,
  'gemini_generate_content': API_FORMAT_GEMINI_GENERATE_CONTENT,
  'google': API_FORMAT_GEMINI_GENERATE_CONTENT
})

export function createDefaultCacheConfig() {
  return {
    enabled: false,
    systemPrompt: true,
    ttl: '5m'
  }
}

export function normalizeApiFormat(value) {
  const format = String(value || '').trim().toLowerCase()
  return API_FORMAT_ALIASES[format] || API_FORMAT_OPENAI_COMPATIBLE
}

export function normalizeCacheConfig(value) {
  const defaults = createDefaultCacheConfig()
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    enabled: !!raw.enabled,
    systemPrompt: Object.prototype.hasOwnProperty.call(raw, 'systemPrompt') ? !!raw.systemPrompt : defaults.systemPrompt,
    ttl: String(raw.ttl || '').trim().toLowerCase() === '1h' ? '1h' : defaults.ttl
  }
}

export function normalizeProviderConfig(config = {}) {
  const cfg = config && typeof config === 'object' && !Array.isArray(config) ? config : {}
  return {
    ...cfg,
    key: normalizeApiKey(cfg.key),
    apiFormat: normalizeApiFormat(cfg.apiFormat),
    customHeadersJson: typeof cfg.customHeadersJson === 'string' ? cfg.customHeadersJson : '',
    customBodyJson: typeof cfg.customBodyJson === 'string' ? cfg.customBodyJson : '',
    autoAdaptParameters: cfg.autoAdaptParameters !== false,
    removeBodyParams: normalizeRemovedRequestParameters(cfg.removeBodyParams),
    cacheConfig: normalizeCacheConfig(cfg.cacheConfig)
  }
}

export function isOpenAICompatibleFormat(configOrFormat) {
  const format = typeof configOrFormat === 'string'
    ? configOrFormat
    : configOrFormat?.apiFormat
  return normalizeApiFormat(format) === API_FORMAT_OPENAI_COMPATIBLE
}
