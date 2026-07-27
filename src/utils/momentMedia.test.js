import { describe, it, expect } from 'vitest'
import { extractMomentMedia, normalizeMomentVoiceEmotion, estimateMomentVoiceDuration } from './momentMedia'

describe('extractMomentMedia', () => {
  it('returns plain text unchanged', () => {
    const r = extractMomentMedia('今天天气真好')
    expect(r.text).toBe('今天天气真好')
    expect(r.mood).toBe('')
    expect(r.imageTags).toEqual([])
    expect(r.voiceText).toBe('')
  })

  it('extracts image marker with colons inside tags', () => {
    const r = extractMomentMedia('刚拍的 [图:sunset, seaside, warm lighting]')
    expect(r.text).toBe('刚拍的')
    expect(r.imageTags).toEqual(['sunset, seaside, warm lighting'])
  })

  it('extracts multiple image markers', () => {
    const r = extractMomentMedia('[图:cat] 和 [图:dog] 都好可爱')
    expect(r.imageTags).toEqual(['cat', 'dog'])
    expect(r.text).toBe('和 都好可爱')
  })

  it('extracts voice marker without emotion', () => {
    const r = extractMomentMedia('[语音:今天超开心的]')
    expect(r.voiceText).toBe('今天超开心的')
    expect(r.voiceEmotion).toBe('')
    expect(r.voiceDuration).toBe(estimateMomentVoiceDuration('今天超开心的'))
  })

  it('extracts voice marker with chinese emotion', () => {
    const r = extractMomentMedia('[语音:开心:今天超开心的]')
    expect(r.voiceText).toBe('今天超开心的')
    expect(r.voiceEmotion).toBe('happy')
  })

  it('treats non-emotion first segment as text', () => {
    const r = extractMomentMedia('[语音:提醒你:早点睡]')
    expect(r.voiceText).toBe('提醒你:早点睡')
    expect(r.voiceEmotion).toBe('')
  })

  it('splits trailing emoji mood', () => {
    const r = extractMomentMedia('今天超顺利:😊')
    expect(r.text).toBe('今天超顺利')
    expect(r.mood).toBe('😊')
  })

  it('does not split non-emoji trailing segment as mood', () => {
    const r = extractMomentMedia('今天计划：跑步')
    expect(r.text).toBe('今天计划：跑步')
    expect(r.mood).toBe('')
  })

  it('combines mood and media markers', () => {
    const r = extractMomentMedia('看海去咯 [图:sea, beach]:🌊')
    expect(r.text).toBe('看海去咯')
    expect(r.imageTags).toEqual(['sea, beach'])
    expect(r.mood).toBe('🌊')
  })

  it('strips markers when permissions disabled', () => {
    const r = extractMomentMedia('看海 [图:sea] [语音:哈喽]', { allowImages: false, allowVoice: false })
    expect(r.text).toBe('看海')
    expect(r.imageTags).toEqual([])
    expect(r.voiceText).toBe('')
  })

  it('supports fullwidth brackets and colons', () => {
    const r = extractMomentMedia('打卡【图：coffee, latte art】')
    expect(r.imageTags).toEqual(['coffee, latte art'])
    expect(r.text).toBe('打卡')
  })

  it('handles media-only payload', () => {
    const r = extractMomentMedia('[语音:在吗]')
    expect(r.text).toBe('')
    expect(r.voiceText).toBe('在吗')
  })
})

describe('normalizeMomentVoiceEmotion', () => {
  it('maps chinese aliases', () => {
    expect(normalizeMomentVoiceEmotion('开心')).toBe('happy')
    expect(normalizeMomentVoiceEmotion('难过')).toBe('sad')
  })
  it('passes through english keys', () => {
    expect(normalizeMomentVoiceEmotion('happy')).toBe('happy')
  })
  it('returns empty for unknown', () => {
    expect(normalizeMomentVoiceEmotion('随便')).toBe('')
  })
})
