/**
 * 动态观察事件源 — 用户发新动态时，通知 AI 角色决定是否回应
 */
import { watch } from 'vue'
import { EventType, isQuietHours } from './eventTypes'

export function createMomentsSource({ emit, store, livenessStore, momentsStore }) {
  let stopWatch = null

  function start() {
    stop()
    if (!momentsStore) return

    // 监听动态列表长度变化（新增动态）
    stopWatch = watch(
      () => momentsStore.moments?.length,
      (newLen, oldLen) => {
        if (!store.allowLivenessEngine) return
        if (isQuietHours(store.livenessConfig)) return
        if (!newLen || newLen <= (oldLen || 0)) return

        // 取最新一条动态
        const latest = momentsStore.sortedMoments?.[0] || momentsStore.moments?.[0]
        if (!latest) return

        const isUserPost = !store.contacts?.some(c => c.id === latest.authorId)
        const content = (latest.content || latest.voiceText || '').slice(0, 200)
        const mood = latest.mood || null

        const buildContext = (contactId) => {
          const s = livenessStore.getState(contactId)
          return {
            postContent: content,
            postMood: mood,
            affection: s.affection,
            authorName: latest.authorName || '用户',
            authorId: latest.authorId || null,
            momentId: latest.id || null
          }
        }

        if (isUserPost) {
          // 用户发动态：通知所有联系人（让每个角色独立决定是否回应）
          const contacts = store.contacts || []
          for (const contact of contacts) {
            if (contact.type === 'group') continue
            emit({
              type: EventType.MOMENT_POST,
              contactId: contact.id,
              context: buildContext(contact.id)
            })
          }
          return
        }

        // AI 角色发动态：通知与作者同熟人分组的其他角色（随机采样最多2个，控制 API 消耗）
        const peers = (store.contacts || []).filter(c =>
          c.type !== 'group' &&
          c.id !== latest.authorId &&
          momentsStore.areContactsAcquainted?.(c.id, latest.authorId)
        )
        const sampled = peers
          .map(c => ({ c, r: Math.random() }))
          .sort((a, b) => a.r - b.r)
          .slice(0, 2)
          .map(x => x.c)
        for (const contact of sampled) {
          emit({
            type: EventType.MOMENT_POST,
            contactId: contact.id,
            context: buildContext(contact.id)
          })
        }
      }
    )
  }

  function stop() {
    if (stopWatch) {
      stopWatch()
      stopWatch = null
    }
  }

  return { start, stop }
}
