/**
 * VN 输出解析器
 * 将 LLM 的结构化文本输出解析为 VNInstruction 数组
 */

export function useVNParser() {
  const PATTERNS = {
    // [bg:教室_白天] 或 [bg:NEW:走廊:school hallway, anime style]
    bg: /^\[bg:(?:NEW:)?([^:\]]+)(?::([^\]]+))?\]\s*$/,

    // [choices] ... [/choices]
    choicesStart: /^\[choices\]\s*$/,
    choicesEnd: /^\[\/choices\]\s*$/,
    choiceItem: /^\s*-\s*(.+?)(?:\s*->\s*(.+))?\s*$/,

    // [var:affection.小樱:+1]  [var:flags.day1:true]
    variable: /^\[var:([^:\]]+):([^\]]+)\]\s*$/,

    // [if:好感度>=3] ... [else] ... [endif]
    ifStart: /^\[if:([^\]]+)\]\s*$/,
    elseMark: /^\[else\]\s*$/,
    ifEnd: /^\[endif\]\s*$/,

    // 旁白: *text*
    narration: /^\*(.+)\*$/,

    // 新格式: [dialog:角色名]text / [narration]text
    dialogTag: /^\[dialog:([^\]]+)\]\s*(.+)$/,
    narrationTag: /^\[narration\]\s*(.+)$/,

    // [scene:教学楼后|傍晚]，以及弱模型常见的“地点：…”“时间：…”
    sceneTag: /^\[scene:([^|\]]*)(?:\|([^\]]*))?\]\s*$/,
    sceneMeta: /^(地点|场景|位置|时间|时段)[：:]\s*(.+)$/,

    // 对话: 角色名：对话内容  或  角色名: 对话内容
    dialog: /^([^：:*\[\]\n]{1,20})[：:]\s*(.+)$/
  }

  const KNOWN_ANIMATIONS = new Set([
    'fadeIn', 'slideLeft', 'slideRight', 'slideUp', 'bounce',
    'shake', 'jump', 'nod',
    'fadeOut'
  ])

  function resolveSpeakerName(rawName, charMap) {
    const name = String(rawName || '').trim()
    if (charMap[name]) return name

    const withoutCue = name.replace(/\s*[（(][^）)]{0,20}[）)]\s*$/, '').trim()
    if (charMap[withoutCue]) return withoutCue
    return name
  }

  function normalizePresentationLine(rawLine) {
    let line = String(rawLine || '').trim()
    if (!line || /^```/.test(line)) return ''

    line = line.replace(/^`(.+)`$/, '$1').trim()
    line = line.replace(/^(?:#{1,6}\s+|[-•]\s+)/, '').trim()
    line = line.replace(/^\*\*([^*]+)\*\*\s*([：:])/, '$1$2')
    line = line.replace(/^__([^_]+)__\s*([：:])/, '$1$2')

    if (/^\*\*.+\*\*$/.test(line) || /^__.+__$/.test(line)) {
      line = line.slice(2, -2).trim()
    }

    return line
  }

  function parseDialogLine(line, charMap) {
    const characterNames = Object.keys(charMap).sort((a, b) => b.length - a.length)

    const taggedMatch = line.match(PATTERNS.dialogTag)
    if (taggedMatch) {
      const vnName = resolveSpeakerName(taggedMatch[1], charMap)
      if (characterNames.length > 0 && !charMap[vnName]) return null
      return {
        type: 'dialog',
        characterId: charMap[vnName]?.contactId || vnName,
        vnName,
        text: taggedMatch[2].trim()
      }
    }

    const dialogMatch = line.match(PATTERNS.dialog)
    if (dialogMatch) {
      const vnName = resolveSpeakerName(dialogMatch[1], charMap)
      if (characterNames.length > 0 && !charMap[vnName]) return null
      return {
        type: 'dialog',
        characterId: charMap[vnName]?.contactId || vnName,
        vnName,
        text: dialogMatch[2].trim()
      }
    }

    return null
  }

  function parseSceneLine(line) {
    const taggedMatch = line.match(PATTERNS.sceneTag)
    if (taggedMatch) {
      return {
        type: 'scene',
        location: taggedMatch[1]?.trim() || '',
        time: taggedMatch[2]?.trim() || ''
      }
    }

    const narrationTagMatch = line.match(PATTERNS.narrationTag)
    const legacyNarrationMatch = line.match(PATTERNS.narration)
    const candidate = narrationTagMatch?.[1]?.trim() || legacyNarrationMatch?.[1]?.trim() || line
    const metaMatch = candidate.match(PATTERNS.sceneMeta)
    if (!metaMatch) return null
    const key = metaMatch[1]
    const value = metaMatch[2].trim()
    if (!value) return null

    if (key === '时间' || key === '时段') {
      return { type: 'scene', location: '', time: value }
    }
    return { type: 'scene', location: value, time: '' }
  }

  function appendSceneInstruction(instructions, sceneInst) {
    const last = instructions[instructions.length - 1]
    if (last?.type === 'scene') {
      if (sceneInst.location) last.location = sceneInst.location
      if (sceneInst.time) last.time = sceneInst.time
      return
    }
    instructions.push(sceneInst)
  }

  function parseSpriteLine(line, charMap) {
    if (!line.startsWith('[sprite:') || !line.endsWith(']')) return null
    const inner = line.slice('[sprite:'.length, -1)
    const parts = inner.split(':')
    if (parts.length < 2) return null

    const vnName = (parts[0] || '').trim()
    const positionRaw = (parts[1] || '').trim()
    if (!vnName || !positionRaw) return null

    const characterId = charMap[vnName]?.contactId || vnName

    // Exit
    if (positionRaw === 'none') {
      const animation = (parts[2] || 'fadeOut').trim() || 'fadeOut'
      return {
        type: 'sprite',
        characterId,
        vnName,
        position: 'none',
        expression: '',
        isNew: false,
        prompt: null,
        animation
      }
    }

    // Move: left>center
    let position = positionRaw
    let inferredAnim = null
    if (positionRaw.includes('>')) {
      const to = positionRaw.split('>').pop()
      position = (to || '').trim() || positionRaw
      inferredAnim = 'slide'
    }

    // Parse remaining tokens.
    // Formats:
    // [sprite:角色名:位置:表情]
    // [sprite:角色名:位置:表情:动画]
    // [sprite:角色名:位置:NEW:表情:英文prompt]
    // [sprite:角色名:位置:NEW:表情:英文prompt:动画]
    let idx = 2
    let isNew = false
    if ((parts[idx] || '').trim() === 'NEW') {
      isNew = true
      idx += 1
    }

    const expression = ((parts[idx] || 'normal') + '').trim() || 'normal'
    idx += 1

    let prompt = null
    let animation = null

    if (isNew) {
      const rest = parts.slice(idx)
      if (rest.length === 0) {
        prompt = null
      } else if (rest.length === 1) {
        prompt = rest[0].trim()
      } else {
        const last = rest[rest.length - 1].trim()
        if (KNOWN_ANIMATIONS.has(last)) {
          animation = last
          prompt = rest.slice(0, -1).join(':').trim()
        } else {
          prompt = rest.join(':').trim()
        }
      }
    } else {
      const tail = parts.slice(idx)
      if (tail.length > 0) {
        const maybeAnim = tail[tail.length - 1].trim()
        if (KNOWN_ANIMATIONS.has(maybeAnim)) {
          animation = maybeAnim
        } else if (tail.length === 1) {
          // Some models may output move-only hints; allow.
          animation = inferredAnim || null
        }
      }
      if (!animation) animation = inferredAnim || null
    }

    return {
      type: 'sprite',
      characterId,
      vnName,
      position,
      expression,
      isNew,
      prompt,
      animation
    }
  }

  /**
   * 解析 LLM 输出文本为指令数组
   * @param {string} rawText - LLM 原始输出
   * @param {Object} options - { characters: [{ vnName, contactId }] }
   * @returns {Array}
   */
  function parse(rawText, options = {}) {
    const { characters = [] } = options
    const charMap = {}
    characters.forEach(c => { if (c?.vnName) charMap[c.vnName] = c })

    const lines = String(rawText || '').split('\n')
    const instructions = []
    let inChoices = false
    let currentChoices = []

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i].trim()
      if (!rawLine) continue

      // --- Choices block ---
      if (PATTERNS.choicesStart.test(rawLine)) {
        inChoices = true
        currentChoices = []
        continue
      }
      if (PATTERNS.choicesEnd.test(rawLine)) {
        inChoices = false
        if (currentChoices.length > 0) {
          instructions.push({ type: 'choices', options: currentChoices })
        }
        continue
      }
      if (inChoices) {
        const cm = rawLine.match(PATTERNS.choiceItem)
        if (cm) {
          currentChoices.push({
            text: (cm[1] || '').trim(),
            effect: cm[2] ? cm[2].trim() : null
          })
        }
        continue
      }

      const line = normalizePresentationLine(rawLine)
      if (!line) continue

      // --- Scene metadata ---
      const sceneInst = parseSceneLine(line)
      if (sceneInst) {
        appendSceneInstruction(instructions, sceneInst)
        continue
      }

      // --- BGM ---
      const bgmMatch = line.match(/^\[bgm:([^\]]+)\]$/)
      if (bgmMatch) {
        const bgmName = bgmMatch[1].trim()
        instructions.push({
          type: 'bgm',
          name: bgmName === 'stop' ? null : bgmName
        })
        continue
      }

      // --- Background ---
      const bgMatch = line.match(PATTERNS.bg)
      if (bgMatch) {
        const isNew = line.includes('[bg:NEW:')
        const backgroundInst = {
          type: 'bg',
          name: bgMatch[1].trim(),
          isNew,
          prompt: bgMatch[2] ? bgMatch[2].trim() : null,
          transition: 'fade'
        }
        if (instructions[instructions.length - 1]?.type === 'scene') {
          instructions.splice(instructions.length - 1, 0, backgroundInst)
        } else {
          instructions.push(backgroundInst)
        }
        continue
      }

      // --- Sprite ---
      const spriteInst = parseSpriteLine(line, charMap)
      if (spriteInst) {
        instructions.push(spriteInst)
        continue
      }

      // --- Conditional branch ---
      const ifMatch = line.match(PATTERNS.ifStart)
      if (ifMatch) {
        instructions.push({ type: 'if', expr: ifMatch[1].trim() })
        continue
      }
      if (PATTERNS.elseMark.test(line)) {
        instructions.push({ type: 'else' })
        continue
      }
      if (PATTERNS.ifEnd.test(line)) {
        instructions.push({ type: 'endif' })
        continue
      }

      // --- Variable ---
      const varMatch = line.match(PATTERNS.variable)
      if (varMatch) {
        const key = varMatch[1].trim()
        const rawVal = varMatch[2].trim()
        let operation = 'set'
        let value = rawVal

        if (rawVal.startsWith('+') || rawVal.startsWith('-')) {
          operation = 'add'
          value = parseFloat(rawVal)
        } else if (rawVal === 'true' || rawVal === 'false') {
          value = rawVal === 'true'
        } else if (!isNaN(rawVal)) {
          value = parseFloat(rawVal)
        }

        instructions.push({ type: 'variable', key, operation, value })
        continue
      }

      // --- Dialog ---
      const dialogInst = parseDialogLine(line, charMap)
      if (dialogInst) {
        instructions.push(dialogInst)
        continue
      }

      // --- Explicit narration ---
      const taggedNarrationMatch = line.match(PATTERNS.narrationTag)
      if (taggedNarrationMatch) {
        instructions.push({ type: 'narration', text: taggedNarrationMatch[1].trim() })
        continue
      }

      // --- Narration ---
      const narMatch = line.match(PATTERNS.narration)
      if (narMatch) {
        instructions.push({ type: 'narration', text: narMatch[1].trim() })
        continue
      }

      // --- Fallback: narration ---
      instructions.push({ type: 'narration', text: line })
    }

    return instructions
  }

  /**
   * 从指令数组中提取需要生成的新资源
   * @param {Array} instructions
   */
  function extractNewResources(instructions) {
    const backgrounds = []
    const sprites = []

    ;(instructions || []).forEach(inst => {
      if (inst?.type === 'bg' && inst.isNew && inst.prompt) {
        backgrounds.push({ name: inst.name, prompt: inst.prompt })
      }
      if (inst?.type === 'sprite' && inst.isNew && inst.prompt) {
        sprites.push({
          characterId: inst.characterId,
          vnName: inst.vnName,
          expression: inst.expression,
          prompt: inst.prompt
        })
      }
    })

    return { backgrounds, sprites }
  }

  return { parse, extractNewResources, PATTERNS }
}

