import { describe, expect, it } from 'vitest'

import {
  assertValidHeader,
  assertValidHeaders,
  normalizeAbsoluteHttpUrl,
  normalizeApiKey,
  mergeRequestHeaders,
  prepareApiKey,
  stripInvisibleFormatChars
} from './httpHeaders'

describe('HTTP header safety', () => {
  it('removes invisible format characters and common copied wrappers from API keys', () => {
    expect(stripInvisibleFormatChars('sk\u200B-test')).toBe('sk-test')
    expect(normalizeApiKey(' “Bearer sk-test\u200B” ')).toBe('sk-test')
    expect(normalizeApiKey("'pst-test'")).toBe('pst-test')
  })

  it('accepts printable ASCII API keys and rejects unsafe copied text', () => {
    expect(prepareApiKey(' sk-test_123 ')).toBe('sk-test_123')
    expect(() => prepareApiKey('密钥：sk-test', 'NovelAI API Key')).toThrow(
      'NovelAI API Key 含有中文、全角符号、空格或换行'
    )
    expect(() => prepareApiKey('sk test')).toThrow('API Key 含有中文、全角符号、空格或换行')
  })

  it('validates header names and values without exposing their values', () => {
    expect(() => assertValidHeader('x-test', 'plain-value')).not.toThrow()
    expect(() => assertValidHeader('中文', 'value')).toThrow('请求头名称含有非法字符')
    expect(() => assertValidHeaders({ 'x-note': '中文' }, '自定义 Header')).toThrow(
      '自定义 Header x-note 的值含有中文、全角符号、换行或不可见字符'
    )
  })

  it('merges header names case-insensitively with the later value winning', () => {
    expect(mergeRequestHeaders(
      { authorization: 'Bearer old', 'x-test': 'old' },
      { Authorization: 'Bearer new', 'X-Test': 'new' }
    )).toEqual({
      Authorization: 'Bearer new',
      'X-Test': 'new'
    })
  })

  it('normalizes absolute HTTP URLs before placing them in a header', () => {
    expect(normalizeAbsoluteHttpUrl(' https://example.com/中文\u200B?q=测试 ')).toBe(
      'https://example.com/%E4%B8%AD%E6%96%87?q=%E6%B5%8B%E8%AF%95'
    )
    expect(() => normalizeAbsoluteHttpUrl('/relative')).toThrow('API 地址无效')
  })
})
