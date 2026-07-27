import { describe, expect, it } from 'vitest'
import { useVNParser } from './useVNParser'

describe('useVNParser', () => {
  const { parse } = useVNParser()

  it('解析显式对话与旁白标签', () => {
    const out = parse('[dialog:小樱]你来啦。\n[narration]风吹过走廊', {
      characters: [{ vnName: '小樱', contactId: 'c1' }]
    })
    expect(out).toEqual([
      { type: 'dialog', characterId: 'c1', vnName: '小樱', text: '你来啦。' },
      { type: 'narration', text: '风吹过走廊' }
    ])
  })

  it('容错解析 Markdown 包裹的角色对话', () => {
    const text = [
      '```text',
      '**小樱**：“你来啦。”',
      '- **小樱**：先进去吧。',
      '```'
    ].join('\n')
    const out = parse(text, { characters: [{ vnName: '小樱', contactId: 'c1' }] })

    expect(out).toEqual([
      { type: 'dialog', characterId: 'c1', vnName: '小樱', text: '“你来啦。”' },
      { type: 'dialog', characterId: 'c1', vnName: '小樱', text: '先进去吧。' }
    ])
  })

  it('不会猜测省略标签或冒号的自由文本', () => {
    const text = [
      '小樱「跟我来」',
      '【小樱】等等我',
      '*小樱……是你。*',
      '*小樱 你怎么在这里。*'
    ].join('\n')
    const out = parse(text, { characters: [{ vnName: '小樱', contactId: 'c1' }] })

    expect(out).toEqual([
      { type: 'narration', text: '小樱「跟我来」' },
      { type: 'narration', text: '【小樱】等等我' },
      { type: 'narration', text: '小樱……是你。' },
      { type: 'narration', text: '小樱 你怎么在这里。' }
    ])
  })

  it('解析显式场景标签', () => {
    const out = parse('[scene:教学楼后|傍晚]')

    expect(out).toEqual([
      { type: 'scene', location: '教学楼后', time: '傍晚' }
    ])
  })

  it('将弱模型输出的地点与时间合并为场景信息', () => {
    const out = parse('地点：教学楼后\n时间：傍晚\n[dialog:文粟]你来了。', {
      characters: [{ vnName: '文粟', contactId: 'c1' }]
    })

    expect(out).toEqual([
      { type: 'scene', location: '教学楼后', time: '傍晚' },
      { type: 'dialog', characterId: 'c1', vnName: '文粟', text: '你来了。' }
    ])
  })

  it('解析条件分支指令', () => {
    const text = [
      '[if:好感度>=3]',
      '[dialog:小樱]最喜欢你了！',
      '[else]',
      '[dialog:小樱]……你好。',
      '[endif]'
    ].join('\n')
    const out = parse(text, { characters: [{ vnName: '小樱', contactId: 'c1' }] })
    expect(out.map(i => i.type)).toEqual(['if', 'dialog', 'else', 'dialog', 'endif'])
    expect(out[0].expr).toBe('好感度>=3')
  })

  it('解析裸变量条件与不带 else 的块', () => {
    const out = parse('[if:flags.day1]\n[narration]第一天的回忆\n[endif]')
    expect(out.map(i => i.type)).toEqual(['if', 'narration', 'endif'])
    expect(out[0].expr).toBe('flags.day1')
  })

  it('条件标记不会被当作旁白兜底', () => {
    const out = parse('[if:好感度>2]\n[else]\n[endif]')
    expect(out.every(i => i.type !== 'narration')).toBe(true)
  })

  it('变量指令仍正常解析', () => {
    const out = parse('[var:好感度:+1]')
    expect(out).toEqual([{ type: 'variable', key: '好感度', operation: 'add', value: 1 }])
  })

  it('选项块不受条件语法影响', () => {
    const text = [
      '[choices]',
      '- 去屋顶 -> 好感度+1',
      '- 回教室',
      '[/choices]'
    ].join('\n')
    const out = parse(text)
    expect(out).toEqual([{
      type: 'choices',
      options: [
        { text: '去屋顶', effect: '好感度+1' },
        { text: '回教室', effect: null }
      ]
    }])
  })
})
