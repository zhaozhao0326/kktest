import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useVNStore } from './vn'

describe('VN save resume state', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('restores the current line and remaining instructions', () => {
    const store = useVNStore()
    store.createProject({ name: '测试项目', characters: [] })

    const currentDialog = {
      characterId: 'c1',
      vnName: '文粟',
      text: '你来了。',
      isNarration: false
    }
    const queue = [
      { type: 'dialog', characterId: 'c1', vnName: '文粟', text: '你来了。' },
      { type: 'narration', text: '风吹过走廊。' },
      { type: 'choices', options: [{ text: '走近一些', effect: null }] }
    ]

    store.player.currentScene = { location: '教学楼后', time: '傍晚' }
    store.player.currentDialog = currentDialog
    store.player.instructionQueue = queue
    store.player.instructionIndex = 0

    const save = store.saveGame('节点')
    store.resetPlayer()
    const resume = store.loadGame(save.id)

    expect(store.player.currentScene).toEqual({ location: '教学楼后', time: '傍晚' })
    expect(store.player.currentDialog).toEqual(currentDialog)
    expect(resume.pendingCurrentInstruction).toEqual(queue[0])
    expect(resume.pendingInstructions).toEqual(queue.slice(1))
    expect(resume.waitForAdvance).toBe(true)
    expect(resume.shouldGenerate).toBe(false)
  })

  it('marks a save without choices or pending instructions for continuation', () => {
    const store = useVNStore()
    store.createProject({ name: '测试项目', characters: [] })
    store.player.currentDialog = {
      characterId: 'c1',
      vnName: '文粟',
      text: '然后呢？',
      isNarration: false
    }

    const save = store.saveGame('待续写')
    const resume = store.loadGame(save.id)

    expect(resume.waitForAdvance).toBe(true)
    expect(resume.shouldGenerate).toBe(true)
    expect(resume.pendingInstructions).toEqual([])
  })
})
