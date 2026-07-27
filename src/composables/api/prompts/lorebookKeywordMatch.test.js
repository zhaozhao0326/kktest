import { describe, expect, it } from 'vitest'
import { matchesLorebookKeyword, prepareKeywordMatchContext } from './lorebookKeywordMatch'

function match(text, keyword) {
  return matchesLorebookKeyword(prepareKeywordMatchContext(text), keyword)
}

describe('lorebookKeywordMatch', () => {
  it('matches ASCII keywords on word boundaries only', () => {
    expect(match('I love my cat so much', 'cat')).toBe(true)
    expect(match('Cat is sleeping', 'cat')).toBe(true)
    expect(match('let me concatenate strings', 'cat')).toBe(false)
    expect(match('education matters', 'cat')).toBe(false)
  })

  it('keeps substring matching for multi-char CJK keywords', () => {
    expect(match('今天下暴雨了', '暴雨')).toBe(true)
    expect(match('魔法学院的传说', '魔法学院')).toBe(true)
    expect(match('普通的一天', '魔法学院')).toBe(false)
  })

  it('does not fire single CJK char inside unrelated longer words', () => {
    // 报告点名的场景："雨" 不应命中人名/专名
    expect(match('雨果的小说很好看', '雨')).toBe(false)
    expect(match('李雨桐来了', '雨')).toBe(false)
    expect(match('听说雨果奖公布了', '雨')).toBe(false)
  })

  it('fires single CJK char when standalone or in two-char weather words', () => {
    expect(match('外面在下雨', '雨')).toBe(true)
    expect(match('雨下得好大', '雨')).toBe(true)
    expect(match('今天是雨天', '雨')).toBe(true)
    expect(match('天气预报：雨，转多云', '雨')).toBe(true)
  })

  it('handles empty inputs safely', () => {
    expect(match('', '雨')).toBe(false)
    expect(match('下雨了', '')).toBe(false)
    expect(matchesLorebookKeyword(null, '雨')).toBe(false)
  })

  it('is case-insensitive for ASCII keywords', () => {
    expect(match('Tell me about NASA', 'nasa')).toBe(true)
    expect(match('nasa launch', 'NASA')).toBe(true)
  })
})
