<template>
  <div class="absolute inset-0 flex flex-col bg-[#F2F2F7] dark:bg-black">
    <!-- Header -->
    <div class="glass-panel z-10 flex items-center px-4 pt-app pb-3 shrink-0">
      <button class="text-[#007AFF] text-[17px] flex items-center" @click="goBack">
        <i class="ph ph-caret-left text-2xl"></i>
      </button>
      <span class="flex-1 text-center font-semibold text-[17px] dark:text-white">动态详情</span>
      <div class="w-8"></div>
    </div>

    <div v-if="moment" class="flex-1 overflow-y-auto no-scrollbar">
      <!-- Moment Content -->
      <div class="bg-white dark:bg-[#1C1C1E] m-4 rounded-3xl overflow-hidden shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.06]">
        <div class="p-4">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-12 h-12 rounded-full bg-gradient-to-br from-pink-400 to-violet-500 flex items-center justify-center text-white overflow-hidden ring-1 ring-black/5">
              <img v-if="isImageLikeUrl(moment.authorAvatar)" :src="moment.authorAvatar" class="w-full h-full object-cover">
              <span v-else class="text-xl">{{ moment.authorAvatar || moment.authorName?.[0] || '?' }}</span>
            </div>
            <div class="flex-1">
              <div class="font-semibold text-[16px] dark:text-white">{{ moment.authorName }}</div>
              <div class="text-xs text-gray-400">
                {{ formatTime(moment.time) }}
                <span v-if="moment.mood" class="ml-1">{{ moment.mood }}</span>
              </div>
            </div>
            <button
              v-if="moment.authorId !== momentsStore.forumUser.id"
              class="px-3 py-1 rounded-full text-sm font-medium"
              :class="momentsStore.isFollowing(moment.authorId) ? 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300' : 'bg-gradient-to-r from-pink-500 to-violet-500 text-white'"
              @click="momentsStore.toggleFollow(moment.authorId); scheduleSave()"
            >
              {{ momentsStore.isFollowing(moment.authorId) ? '已关注' : '关注' }}
            </button>
          </div>

          <p v-if="moment.content" class="text-[16px] text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{{ moment.content }}</p>

          <!-- Voice -->
          <div v-if="moment.voiceText" class="mt-3">
            <MomentVoiceBubble
              :voice-text="moment.voiceText"
              :voice-emotion="moment.voiceEmotion || ''"
              :voice-duration="moment.voiceDuration || 0"
              :author-id="moment.authorId"
              :is-user="isUserAuthor(moment.authorId)"
            />
          </div>

          <!-- Images -->
          <div v-if="imageTileCount > 0" class="mt-3">
            <div
              v-if="imageTileCount === 1"
              class="rounded-2xl overflow-hidden ring-1 ring-black/5 dark:ring-white/10 max-w-[320px]"
            >
              <img v-if="moment.images?.length" :src="moment.images[0]" class="w-full max-h-[400px] object-cover">
              <div v-else class="w-full aspect-[4/3] gen-pending-tile">
                <i class="ph-bold ph-spinner animate-spin text-xl"></i>
                <span class="text-[11px] mt-1">生成中…</span>
              </div>
            </div>
            <div v-else class="grid gap-1.5 rounded-2xl overflow-hidden" :class="imageGridClass(imageTileCount)">
              <div v-for="(img, idx) in (moment.images || [])" :key="'img-' + idx" class="aspect-square rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 ring-1 ring-black/5">
                <img :src="img" class="w-full h-full object-cover">
              </div>
              <div v-for="n in (moment.imageGenPending || 0)" :key="'pending-' + n" class="aspect-square rounded-xl gen-pending-tile">
                <i class="ph-bold ph-spinner animate-spin text-lg"></i>
              </div>
            </div>
          </div>

          <!-- Tags -->
          <div v-if="moment.tags && moment.tags.length > 0" class="flex gap-2 mt-3 flex-wrap">
            <span v-for="tag in moment.tags" :key="tag" class="px-2.5 py-1 rounded-full bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 text-xs font-medium">#{{ tag }}</span>
          </div>

          <div class="flex items-center gap-6 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
            <button class="flex items-center gap-1.5" :class="moment.isLiked ? 'text-pink-500' : 'text-gray-400'" @click="momentsStore.likeMoment(moment.id); scheduleSave()">
              <i :class="moment.isLiked ? 'ph-fill ph-heart' : 'ph ph-heart'" class="text-2xl"></i>
              <span>{{ moment.likes || 0 }}</span>
            </button>
            <div class="flex items-center gap-1.5 text-gray-400">
              <i class="ph ph-chat-circle text-2xl"></i>
              <span>{{ moment.replies?.length || 0 }}</span>
            </div>
          </div>

          <!-- Liked by -->
          <div v-if="likedByLabel" class="flex items-center gap-1.5 mt-3 text-[13px] text-gray-500 dark:text-gray-400">
            <i class="ph-fill ph-heart text-pink-400"></i>
            <span>{{ likedByLabel }}</span>
          </div>
        </div>
      </div>

      <!-- Replies -->
      <div class="px-4 pb-32">
        <div class="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">评论 ({{ moment.replies?.length || 0 }})</div>
        <div class="space-y-3">
          <div v-for="reply in moment.replies" :key="reply.id" class="bg-white dark:bg-[#1C1C1E] rounded-2xl p-4 shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.06]">
            <div class="flex items-start gap-3">
              <div class="w-9 h-9 rounded-full bg-gradient-to-br from-green-400 to-teal-500 flex items-center justify-center text-white overflow-hidden shrink-0">
                <img v-if="isImageLikeUrl(reply.authorAvatar)" :src="reply.authorAvatar" class="w-full h-full object-cover">
                <span v-else>{{ reply.authorAvatar || reply.authorName?.[0] || '?' }}</span>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between">
                  <span class="font-semibold text-[14px] dark:text-white">{{ reply.authorName }}</span>
                  <span class="text-xs text-gray-400">{{ formatTime(reply.time) }}</span>
                </div>
                <p v-if="reply.replyToAuthorName" class="text-[12px] text-gray-400 mt-1">回复 @{{ reply.replyToAuthorName }}</p>
                <p v-if="reply.content" class="text-[15px] text-gray-600 dark:text-gray-300 mt-1 whitespace-pre-wrap">{{ reply.content }}</p>
                <div v-if="reply.voiceText" class="mt-2">
                  <MomentVoiceBubble
                    compact
                    :voice-text="reply.voiceText"
                    :voice-emotion="reply.voiceEmotion || ''"
                    :voice-duration="reply.voiceDuration || 0"
                    :author-id="reply.authorId"
                    :is-user="isUserAuthor(reply.authorId)"
                  />
                </div>
                <div v-if="reply.images?.length || reply.imageGenPending" class="mt-2">
                  <img
                    v-if="reply.images?.length"
                    :src="reply.images[0]"
                    class="w-28 h-28 rounded-xl object-cover ring-1 ring-black/5"
                  >
                  <div v-else class="w-28 h-28 rounded-xl gen-pending-tile">
                    <i class="ph-bold ph-spinner animate-spin"></i>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="flex-1 flex items-center justify-center text-gray-400">
      动态不存在
    </div>

    <!-- Reply Input -->
    <div v-if="moment" class="absolute bottom-0 left-0 right-0 bg-white/90 dark:bg-[#1C1C1E]/90 backdrop-blur-xl border-t border-gray-200 dark:border-gray-800 pb-app">
      <!-- Pending reply media preview -->
      <div v-if="replyImage || replyVoiceText" class="px-4 pt-2 flex items-center gap-3">
        <div v-if="replyImage" class="relative">
          <img :src="replyImage" class="w-14 h-14 rounded-lg object-cover ring-1 ring-black/5">
          <button class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center" @click="replyImage = ''">
            <i class="ph-bold ph-x text-[10px]"></i>
          </button>
        </div>
        <div v-if="replyVoiceText" class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-white/10 text-[12px] text-gray-600 dark:text-gray-300">
          <i class="ph-fill ph-microphone text-pink-500"></i>
          <span class="truncate max-w-[160px]">{{ replyVoiceText }}</span>
          <button class="text-gray-400" @click="replyVoiceText = ''">
            <i class="ph-fill ph-x-circle"></i>
          </button>
        </div>
      </div>
      <div class="p-3 flex items-center gap-2">
        <button class="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-pink-500 transition-colors shrink-0" @click="replyImageInput?.click()">
          <i class="ph ph-image text-[22px]"></i>
        </button>
        <button class="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-pink-500 transition-colors shrink-0" @click="showReplyVoiceModal = true">
          <i class="ph ph-microphone text-[22px]"></i>
        </button>
        <input
          v-model="replyContent"
          type="text"
          placeholder="写评论..."
          class="flex-1 bg-gray-100 dark:bg-[#2C2C2E] rounded-full px-4 py-2.5 outline-none dark:text-white min-w-0"
          @keyup.enter="submitReply"
        >
        <button
          class="w-10 h-10 bg-gradient-to-r from-pink-500 to-violet-500 rounded-full flex items-center justify-center text-white shrink-0 disabled:opacity-50 active:scale-95 transition-all"
          :disabled="!canSubmitReply"
          @click="submitReply"
        >
          <i class="ph-bold ph-arrow-up"></i>
        </button>
        <input ref="replyImageInput" type="file" accept="image/*" class="hidden" @change="onReplyImagePick">
      </div>
    </div>

    <VoiceModal
      :visible="showReplyVoiceModal"
      @cancel="showReplyVoiceModal = false"
      @send="onReplyVoice"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useMomentsStore } from '../../../stores/moments'
import { useContactsStore } from '../../../stores/contacts'
import { useChatStore } from '../../../stores/chat'
import { useStorage } from '../../../composables/useStorage'
import { formatRelativeTime } from '../../../utils/relativeTime'
import VoiceModal from '../../../components/common/VoiceModal.vue'
import MomentVoiceBubble from '../components/MomentVoiceBubble.vue'

const router = useRouter()
const route = useRoute()
const momentsStore = useMomentsStore()
const contactsStore = useContactsStore()
const chatStore = useChatStore()
const { scheduleSave } = useStorage()

const replyContent = ref('')
const replyImage = ref('')
const replyVoiceText = ref('')
const replyImageInput = ref(null)
const showReplyVoiceModal = ref(false)

const moment = computed(() => momentsStore.getMomentById(route.params.id))

const imageTileCount = computed(() => {
  if (!moment.value) return 0
  return (moment.value.images || []).length + (moment.value.imageGenPending || 0)
})

const likedByLabel = computed(() => {
  const m = moment.value
  if (!m) return ''
  const names = []
  if (Array.isArray(m.likedBy)) {
    m.likedBy.forEach(id => {
      const contact = contactsStore.contacts.find(c => c.id === id)
      if (contact?.name) names.push(contact.name)
    })
  }
  if (m.isLiked) names.push('我')
  if (names.length === 0) return ''
  return names.join('、') + ' 觉得很赞'
})

const canSubmitReply = computed(() => {
  return !!(replyContent.value.trim() || replyImage.value || replyVoiceText.value)
})

function isUserAuthor(authorId) {
  return !contactsStore.contacts.some(c => c.id === authorId)
}

function imageGridClass(count) {
  if (count === 1) return 'grid-cols-1 max-w-[280px]'
  if (count <= 4) return 'grid-cols-2 max-w-[300px]'
  return 'grid-cols-3'
}

function formatTime(ts) {
  return formatRelativeTime(ts, { maxRelativeDays: 0 })
}

function goBack() {
  // 桥接：设置返回标记，让下次 API 调用注入上下文
  if (moment.value) {
    chatStore.returnedFromMomentId = moment.value.id
  }
  router.back()
}

function onReplyImagePick(event) {
  const file = event.target?.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    if (typeof reader.result === 'string') replyImage.value = reader.result
  }
  reader.readAsDataURL(file)
  if (event.target) event.target.value = ''
}

function onReplyVoice({ text }) {
  replyVoiceText.value = String(text || '').trim()
  showReplyVoiceModal.value = false
}

function submitReply() {
  if (!canSubmitReply.value || !moment.value) return
  momentsStore.addReply(moment.value.id, {
    content: replyContent.value.trim(),
    images: replyImage.value ? [replyImage.value] : [],
    voiceText: replyVoiceText.value || null,
    authorId: momentsStore.forumUser.id,
    authorName: momentsStore.forumUser.name,
    authorAvatar: momentsStore.forumUser.avatar
  })
  replyContent.value = ''
  replyImage.value = ''
  replyVoiceText.value = ''
  scheduleSave()
}

function isImageLikeUrl(value) {
  const text = String(value || '').trim()
  return text.startsWith('data:') || text.startsWith('blob:') || /^https?:\/\//i.test(text)
}
</script>

<style scoped>
.gen-pending-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  background: linear-gradient(135deg, rgba(236, 72, 153, 0.08), rgba(139, 92, 246, 0.08));
}
</style>
