import { describe, expect, it } from 'vitest'
import { hasImageToken, parseImageTokenPayload, stripImageTokensForDisplay } from './imageTokens'

describe('imageTokens', () => {
  it('defaults to character when no type prefix exists', () => {
    expect(parseImageTokenPayload('smile, cafe')).toMatchObject({
      type: 'character',
      tags: 'smile, cafe',
      options: {}
    })
  })

  it('parses standard type prefix with comma', () => {
    expect(parseImageTokenPayload('type=scene, sunset, beach')).toMatchObject({
      type: 'scene',
      tags: 'sunset, beach'
    })
  })

  it('parses type prefix without comma separator', () => {
    expect(parseImageTokenPayload('type=scene sunset beach')).toMatchObject({
      type: 'scene',
      tags: 'sunset beach'
    })
  })

  it('supports full-width equals and chinese punctuation', () => {
    expect(parseImageTokenPayload('type＝food， strawberry_cake')).toMatchObject({
      type: 'food',
      tags: 'strawberry_cake'
    })
  })

  it('accepts type-only payload', () => {
    expect(parseImageTokenPayload('type=scene')).toMatchObject({
      type: 'scene',
      tags: ''
    })
  })

  it('extracts optional image generation controls from token payload', () => {
    expect(parseImageTokenPayload('type=scene, size=portrait, ratio=16:9, quality=high, format=webp, sunset beach')).toEqual({
      type: 'scene',
      tags: 'sunset beach',
      options: {
        type: 'scene',
        size: 'portrait',
        aspectRatio: '16:9',
        quality: 'high',
        outputFormat: 'webp'
      }
    })
  })

  it('shows a placeholder when reply only contains image tokens', () => {
    expect(stripImageTokensForDisplay('(image:smile, portrait)', true)).toBe('[图片生成中]')
  })

  it('keeps normal text when stripping inline image tokens', () => {
    expect(stripImageTokensForDisplay('好的 (image:smile, portrait)', true).trim()).toBe('好的')
  })

  it('detects image tokens in assistant content', () => {
    expect(hasImageToken('[(image:smile)] (image:portrait)', true)).toBe(true)
  })
})
