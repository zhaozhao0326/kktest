/**
 * 从角色 prompt 中提取人设相关内容，过滤输出格式/规则指令等与人设无关的行。
 * 供辅助 LLM 调用使用（角色日程生成、主动消息决策）——这些场景需要"这个角色是谁"，
 * 而不需要聊天输出格式规则。
 */

/**
 * @param {string} prompt - 角色完整 prompt
 * @param {object} [options]
 * @param {number} [options.maxChars=0] - 过滤后仍超长时的截断上限；0 表示不截断
 * @returns {string}
 */
export function extractPersonaFromPrompt(prompt, { maxChars = 0 } = {}) {
  if (!prompt) return ''
  const lines = String(prompt).split(/\r?\n/)
  const filtered = lines.filter(line => {
    const trimmed = line.trim()
    if (!trimmed) return true
    // 过滤输出格式/token 语法等与人设无关的指令行
    if (/^(输出|格式|规则|注意|要求|token|指令|禁止|不[要得]|必须|每[一条行]|回复时|仅在|独占一行)/i.test(trimmed)) return false
    if (/^\d+[.)、]\s*(每|不[要得]|必须|输出|禁止|保持|回复|使用|避免)/i.test(trimmed)) return false
    if (/\(sticker:|image:|voice:|call:|transfer:|gift:|music:|camera:/i.test(trimmed)) return false
    if (/danbooru|tag|token/i.test(trimmed) && /格式|输出|规则/i.test(trimmed)) return false
    return true
  })
  let text = filtered.join('\n').replace(/\n{3,}/g, '\n\n').trim()

  if (maxChars > 0 && text.length > maxChars) {
    const cut = text.slice(0, maxChars)
    // 尽量在自然边界截断，避免半句话结尾误导模型
    const lastBreak = Math.max(cut.lastIndexOf('\n'), cut.lastIndexOf('。'))
    text = (lastBreak > maxChars * 0.6 ? cut.slice(0, lastBreak + 1) : cut).trimEnd()
  }
  return text
}
