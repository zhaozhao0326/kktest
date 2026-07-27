import { describe, expect, it, vi } from 'vitest'

import { useApiConfigForm } from './useApiConfigForm'

function createHarness(config) {
  const store = {
    activeConfigId: config.id,
    configs: [config]
  }
  const scheduleSave = vi.fn()
  const showToast = vi.fn()
  const form = useApiConfigForm({
    fetchModels: vi.fn(),
    scheduleSave,
    showConfirm: vi.fn(),
    showToast,
    store
  })
  form.loadConfigInputs()
  return { store, scheduleSave, showToast, form }
}

describe('useApiConfigForm provider fields', () => {
  it('loads and saves provider format, custom JSON, and Anthropic cache settings', () => {
    const { store, scheduleSave, form } = createHarness({
      id: 'cfg_1',
      name: 'Claude',
      url: 'https://api.anthropic.com',
      key: 'secret',
      model: 'claude-sonnet',
      apiFormat: 'anthropic-messages',
      customHeadersJson: '{"anthropic-beta":"prompt-caching-2024-07-31"}',
      customBodyJson: '{"metadata":{"source":"kaka"}}',
      autoAdaptParameters: false,
      removeBodyParams: ['temperature'],
      cacheConfig: { enabled: true, systemPrompt: true, ttl: '1h' }
    })

    expect(form.configForm.apiFormat).toBe('anthropic-messages')
    expect(form.configForm.cacheEnabled).toBe(true)
    expect(form.configForm.cacheTtl).toBe('1h')
    expect(form.configForm.autoAdaptParameters).toBe(false)
    expect(form.configForm.removeBodyParamsText).toBe('temperature')

    form.configForm.apiFormat = 'gemini-generate-content'
    form.configForm.customHeadersJson = '{"x-test":"1"}'
    form.configForm.customBodyJson = '{"topP":0.9}'
    form.configForm.autoAdaptParameters = true
    form.configForm.removeBodyParamsText = 'temperature, generationConfig.topP'
    form.configForm.cacheEnabled = false
    form.configForm.cacheTtl = '5m'

    expect(form.saveConfig()).toBe(true)
    expect(store.configs[0]).toMatchObject({
      apiFormat: 'gemini-generate-content',
      customHeadersJson: '{"x-test":"1"}',
      customBodyJson: '{"topP":0.9}',
      autoAdaptParameters: true,
      removeBodyParams: ['temperature', 'generationConfig.topP'],
      cacheConfig: {
        enabled: false,
        systemPrompt: true,
        ttl: '5m'
      }
    })
    expect(scheduleSave).toHaveBeenCalled()
  })

  it('rejects invalid custom JSON before saving', () => {
    const { store, showToast, form } = createHarness({
      id: 'cfg_1',
      name: 'OpenAI',
      url: 'https://api.openai.com/v1',
      key: 'secret',
      model: 'gpt-4o'
    })

    form.configForm.customHeadersJson = '["bad"]'

    expect(form.saveConfig()).toBe(false)
    expect(store.configs[0].customHeadersJson).toBeUndefined()
    expect(showToast).toHaveBeenCalledWith('自定义 headers 必须是 JSON 对象')
  })

  it('normalizes copied API keys when saving and rejects visible non-ASCII text', () => {
    const { store, showToast, form } = createHarness({
      id: 'cfg_1',
      name: 'OpenAI',
      url: 'https://api.openai.com/v1\u200B',
      key: '',
      model: 'gpt-4o'
    })

    form.configForm.key = ' “Bearer sk-test\u200B” '
    expect(form.saveConfig()).toBe(true)
    expect(store.configs[0].key).toBe('sk-test')
    expect(store.configs[0].url).toBe('https://api.openai.com/v1')

    form.configForm.key = '密钥：sk-test'
    expect(form.saveConfig()).toBe(false)
    expect(showToast).toHaveBeenLastCalledWith('API Key 含有中文、全角符号、空格或换行，请只填写密钥本体')
  })
})
