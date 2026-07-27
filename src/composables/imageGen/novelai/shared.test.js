import { describe, expect, it } from 'vitest'

import { buildNovelAIRequestHeaders } from './shared'

describe('NovelAI request headers', () => {
  it('normalizes harmless copy artifacts before building Authorization', () => {
    const headers = buildNovelAIRequestHeaders(' “Bearer pst-test\u200B” ')
    expect(headers.Authorization).toBe('Bearer pst-test')
  })

  it('returns a clear error for non-ASCII API key text', () => {
    expect(() => buildNovelAIRequestHeaders('NovelAI 密钥：pst-test')).toThrow(
      'NovelAI API Key 含有中文、全角符号、空格或换行'
    )
  })
})
