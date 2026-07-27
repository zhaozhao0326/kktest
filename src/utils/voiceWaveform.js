/**
 * 语音消息展示用的确定性波形与时长估算（聊天 / 动态共用）。
 */

export function generateWaveform(text, barCount = 20) {
  const str = String(text ?? '')
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  const bars = []
  for (let i = 0; i < barCount; i++) {
    hash = ((hash << 5) - hash) + i * 31
    hash |= 0
    const h = 4 + Math.abs(hash % 15)
    bars.push(h)
  }
  return bars
}

export function estimateVoiceDuration(text) {
  const len = String(text ?? '').length
  return Math.max(1, Math.round(len / 3))
}
