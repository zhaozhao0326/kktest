import { makeId } from '../../utils/id'
import { markPendingUserMessagesAsRead, sendNotification } from './notifications'
import { useSoundEffects } from '../useSoundEffects'
import { extractMomentMedia } from '../../utils/momentMedia'
import { useSettingsStore } from '../../stores/settings'

export function createProactiveDelivery({
  chatStore,
  hasRecentDuplicateAssistantMessage,
  livenessStore,
  momentsStore,
  store,
  setGlobalLastProactiveAt
}) {
  const soundEffects = useSoundEffects()

  function getMomentMediaPermissions() {
    try {
      const settings = useSettingsStore()
      return {
        allowImages: !!settings.allowAIImageGeneration,
        allowVoice: !!settings.allowAIVoice
      }
    } catch {
      return { allowImages: false, allowVoice: false }
    }
  }

  function resolveTargetMoment(decision, contact) {
    const rawId = String(decision?.targetMomentId || '').trim()
    if (rawId && !/^(latest|last|最新|最近)$/i.test(rawId)) {
      const found = momentsStore.moments.find(m => m.id === rawId)
      if (found) return found
    }
    // 回退：最新的一条非自己发的动态
    const sorted = momentsStore.sortedMoments || momentsStore.moments || []
    return sorted.find(m => m.authorId !== contact.id) || sorted[0] || null
  }

  async function deliverProactiveMoment(contact, decision, config) {
    await sleep((decision.delaySeconds || 5) * 1000)

    const media = extractMomentMedia(decision.momentContent, getMomentMediaPermissions())
    const moment = momentsStore.addMoment({
      content: media.text,
      mood: media.mood || null,
      imageTags: media.imageTags,
      voiceText: media.voiceText,
      voiceEmotion: media.voiceEmotion,
      voiceDuration: media.voiceDuration,
      authorId: contact.id,
      authorName: contact.name,
      authorAvatar: contact.avatar
    })

    if (moment) {
      const preview = (media.text || media.voiceText || '[图片]').slice(0, 40)
      await sendNotification(contact, `发了一条动态: ${preview}`, config, {
        type: 'moment',
        momentId: moment.id
      })
      livenessStore.recordProactiveMsg(contact.id)
      setGlobalLastProactiveAt(Date.now())

      livenessStore.pushEvent({
        type: 'proactive_moment',
        contactId: contact.id,
        context: {
          momentId: moment.id,
          content: preview,
          reason: decision.reason
        }
      })
    }
  }

  async function deliverProactiveComment(contact, decision, config) {
    await sleep((decision.delaySeconds || 5) * 1000)

    const target = resolveTargetMoment(decision, contact)
    if (!target) return

    const media = extractMomentMedia(decision.commentContent, getMomentMediaPermissions())
    const reply = momentsStore.addReply(target.id, {
      content: media.text,
      imageTags: media.imageTags,
      voiceText: media.voiceText,
      voiceEmotion: media.voiceEmotion,
      voiceDuration: media.voiceDuration,
      authorId: contact.id,
      authorName: contact.name,
      authorAvatar: contact.avatar
    })
    if (!reply) return

    const preview = (media.text || media.voiceText || '[图片]').slice(0, 40)
    await sendNotification(contact, `评论了动态: ${preview}`, config, {
      type: 'moment',
      momentId: target.id
    })
    livenessStore.recordProactiveMsg(contact.id)
    setGlobalLastProactiveAt(Date.now())
    livenessStore.pushEvent({
      type: 'proactive_comment',
      contactId: contact.id,
      context: {
        momentId: target.id,
        replyId: reply.id,
        content: preview,
        reason: decision.reason
      }
    })
  }

  // 点赞是轻量动作：不发通知、不占用主动消息配额
  async function deliverProactiveLike(contact, decision) {
    await sleep(Math.min((decision.delaySeconds || 5), 30) * 1000)

    const target = resolveTargetMoment(decision, contact)
    if (!target) return
    const liked = momentsStore.likeMomentBy(target.id, contact.id)
    if (!liked) return

    livenessStore.pushEvent({
      type: 'proactive_like',
      contactId: contact.id,
      context: {
        momentId: target.id,
        reason: decision.reason
      }
    })
  }

  async function deliverProactiveMessage(contact, decision, config) {
    const delay = decision.delaySeconds * 1000

    if (config.simulateReadReceipt) {
      await sleep(Math.min(delay * 0.3, 5000))
    }

    if (config.simulateTypingIndicator) {
      setTypingState(contact.id, true)
      const base = config.replyDelayBase || 2000
      const perChar = config.replyDelayPerChar || 50
      const jitter = (Math.random() - 0.5) * 2 * (config.replyDelayJitter || 3000)
      const typingDuration = base + decision.content.length * perChar + jitter
      await sleep(Math.max(1000, typingDuration))
      setTypingState(contact.id, false)
    } else {
      await sleep(delay)
    }

    if (hasRecentDuplicateAssistantMessage(contact, decision.content)) {
      livenessStore.recordProactiveMsg(contact.id)
      setGlobalLastProactiveAt(Date.now())
      livenessStore.pushEvent({
        type: 'proactive_dedup_skip',
        contactId: contact.id,
        context: {
          content: String(decision.content || '').slice(0, 50),
          reason: 'duplicate_recent_content'
        }
      })
      return
    }

    const msgId = makeId('msg')
    const msg = {
      id: msgId,
      role: 'assistant',
      content: decision.content,
      time: Date.now(),
      proactive: true
    }

    if (!Array.isArray(contact.msgs)) {
      contact.msgs = []
    }
    contact.msgs.push(msg)
    markPendingUserMessagesAsRead(contact, 'delayed_reply')

    // 未读计数：用户不在当前聊天时 +1
    const inActiveChat = store.activeChat?.id === contact.id
    if (!inActiveChat) {
      contact.unreadCount = (contact.unreadCount || 0) + 1
    }

    soundEffects.playEvent(inActiveChat ? 'messageReceive' : 'notification')

    // 发送通知
    await sendNotification(contact, decision.content, config, { type: 'chat' })

    livenessStore.recordProactiveMsg(contact.id)
    setGlobalLastProactiveAt(msg.time)
    livenessStore.pushEvent({
      type: 'proactive_sent',
      contactId: contact.id,
      context: {
        msgId,
        content: decision.content.slice(0, 50),
        reason: decision.reason
      }
    })
  }

  function setTypingState(contactId, typing) {
    if (store.activeChat?.id === contactId) {
      chatStore.ui.isTyping = typing
    }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  return {
    deliverProactiveMessage,
    deliverProactiveMoment,
    deliverProactiveComment,
    deliverProactiveLike
  }
}
