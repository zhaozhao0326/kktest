import { requestNonStreamingChatText } from '../api/nonStreamingChat'

export async function callDecisionAPI(cfg, messages, {
  retries = 1,
  maxTokens = null,
  temperature = 0.8,
  timeoutMs = 12000
} = {}) {
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    const timeout = timeoutMs > 0
      ? setTimeout(() => {
        try { controller?.abort('decision_timeout') } catch { /* noop */ }
      }, timeoutMs)
      : null
    try {
      const { content } = await requestNonStreamingChatText(cfg, messages, {
        temperature,
        maxTokens,
        signal: controller?.signal
      })
      return content
    } catch (e) {
      if (e?.name === 'AbortError') {
        lastErr = new Error('Decision API timeout')
      } else {
        lastErr = e
      }
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1500))
      }
    } finally {
      if (timeout) clearTimeout(timeout)
    }
  }
  throw lastErr
}
