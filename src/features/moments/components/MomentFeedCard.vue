<template>
  <article class="px-4 pt-3.5 pb-1 border-b border-gray-100/80 dark:border-white/[0.06] transition-colors">
    <div class="flex gap-3">
      <!-- Avatar column -->
      <button class="shrink-0 self-start" @click="$emit('open-detail', moment.id)">
        <div class="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden ring-1 ring-black/5 dark:ring-white/10">
          <template v-if="moment.authorAvatar">
            <img v-if="isImageLikeUrl(moment.authorAvatar)" :src="moment.authorAvatar" class="w-full h-full object-cover">
            <span v-else class="w-full h-full flex items-center justify-center text-sm">{{ moment.authorAvatar }}</span>
          </template>
          <span v-else class="w-full h-full flex items-center justify-center text-gray-500 font-bold">{{ moment.authorName?.[0] }}</span>
        </div>
      </button>

      <!-- Content column -->
      <div class="flex-1 min-w-0">
        <!-- Name · time · mood row -->
        <div class="flex items-center gap-1.5 leading-tight">
          <span class="font-bold text-[15px] text-gray-900 dark:text-white truncate">{{ moment.authorName }}</span>
          <span class="text-gray-400 text-[13px] shrink-0">· {{ formatTime(moment.time) }}</span>
          <span v-if="moment.mood" class="text-[14px] shrink-0">{{ moment.mood }}</span>
          <button class="ml-auto text-gray-300 dark:text-gray-600 p-1 -mr-1" @click="$emit('delete', moment)">
            <i class="ph-bold ph-dots-three text-lg"></i>
          </button>
        </div>

        <!-- Text -->
        <p v-if="moment.content" class="text-[15px] text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap mt-0.5 mb-2">
          {{ moment.content }}
        </p>
        <div v-else class="mt-0.5 mb-2"></div>

        <!-- Voice -->
        <div v-if="moment.voiceText" class="mb-2.5">
          <MomentVoiceBubble
            :voice-text="moment.voiceText"
            :voice-emotion="moment.voiceEmotion || ''"
            :voice-duration="moment.voiceDuration || 0"
            :author-id="moment.authorId"
            :is-user="isUserAuthor(moment.authorId)"
          />
        </div>

        <!-- Images (ins-style rounded) -->
        <div v-if="imageTileCount > 0" class="mb-2.5">
          <!-- Single image: large rounded card -->
          <div
            v-if="imageTileCount === 1"
            class="rounded-2xl overflow-hidden ring-1 ring-black/5 dark:ring-white/10 max-w-[300px] shadow-sm"
          >
            <img
              v-if="moment.images?.length"
              :src="moment.images[0]"
              class="w-full max-h-[340px] object-cover"
              loading="lazy"
            >
            <div v-else class="w-full aspect-[4/3] gen-pending-tile">
              <i class="ph-bold ph-spinner animate-spin text-xl"></i>
              <span class="text-[11px] mt-1">生成中…</span>
            </div>
          </div>
          <!-- Multi image grid -->
          <div v-else class="grid gap-1 rounded-2xl overflow-hidden ring-1 ring-black/5 dark:ring-white/10 shadow-sm" :class="imageGridClass(imageTileCount)">
            <div
              v-for="(img, idx) in (moment.images || []).slice(0, 9)"
              :key="'img-' + idx"
              class="aspect-square bg-gray-100 dark:bg-gray-800"
            >
              <img :src="img" class="w-full h-full object-cover" loading="lazy">
            </div>
            <div
              v-for="n in pendingTileCount"
              :key="'pending-' + n"
              class="aspect-square gen-pending-tile"
            >
              <i class="ph-bold ph-spinner animate-spin text-lg"></i>
            </div>
          </div>
        </div>

        <!-- Tags -->
        <div v-if="moment.tags && moment.tags.length > 0" class="flex gap-2 mb-2 overflow-x-auto no-scrollbar">
          <span v-for="tag in moment.tags" :key="tag" class="px-2.5 py-0.5 rounded-full bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 text-xs font-medium">#{{ tag }}</span>
        </div>

        <!-- Action bar (Twitter-style) -->
        <div class="flex items-center gap-10 mt-1 mb-1.5 text-gray-400 dark:text-gray-500">
          <button class="flex items-center gap-1.5 group active:scale-90 transition-transform" @click="focusReply">
            <i class="ph ph-chat-circle text-[19px] group-hover:text-blue-500 transition-colors"></i>
            <span v-if="moment.replies?.length" class="text-[12px] font-medium group-hover:text-blue-500">{{ moment.replies.length }}</span>
          </button>

          <button class="flex items-center gap-1.5 group active:scale-90 transition-transform" @click="$emit('like', moment)">
            <i
              :class="moment.isLiked ? 'ph-fill ph-heart text-pink-500' : 'ph ph-heart'"
              class="text-[19px] transition-colors group-hover:text-pink-500"
            ></i>
            <span
              v-if="moment.likes"
              class="text-[12px] font-medium"
              :class="moment.isLiked ? 'text-pink-500' : 'group-hover:text-pink-500'"
            >{{ moment.likes }}</span>
          </button>

          <button class="flex items-center gap-1.5 group active:scale-90 transition-transform" @click="$emit('open-detail', moment.id)">
            <i class="ph ph-arrow-square-out text-[18px] group-hover:text-emerald-500 transition-colors"></i>
          </button>
        </div>

        <!-- Liked by names (ins-style) -->
        <div v-if="likedByLabel" class="flex items-center gap-1 mb-1.5 text-[12px] text-gray-400">
          <i class="ph-fill ph-heart text-pink-400 text-[12px]"></i>
          <span class="truncate">{{ likedByLabel }}</span>
        </div>

        <!-- Replies preview -->
        <div v-if="moment.replies && moment.replies.length > 0" class="mb-2 bg-gray-50 dark:bg-white/[0.04] rounded-2xl px-3 py-2.5 space-y-1.5">
          <div
            v-for="reply in moment.replies.slice(-3)"
            :key="reply.id"
            class="text-[13px] leading-snug group/reply"
          >
            <span class="font-bold text-gray-800 dark:text-gray-200">{{ reply.authorName }}</span>
            <span v-if="reply.replyToAuthorName" class="text-gray-400"> 回复 @{{ reply.replyToAuthorName }}</span>
            <span class="text-gray-500 dark:text-gray-400">：</span>
            <span v-if="reply.content" class="text-gray-600 dark:text-gray-300">{{ reply.content }}</span>
            <MomentVoiceBubble
              v-if="reply.voiceText"
              class="ml-1 align-middle"
              compact
              :voice-text="reply.voiceText"
              :voice-emotion="reply.voiceEmotion || ''"
              :voice-duration="reply.voiceDuration || 0"
              :author-id="reply.authorId"
              :is-user="isUserAuthor(reply.authorId)"
            />
            <img
              v-if="reply.images?.length"
              :src="reply.images[0]"
              class="inline-block ml-1 w-12 h-12 rounded-lg object-cover align-middle ring-1 ring-black/5"
              loading="lazy"
            >
            <span v-if="reply.imageGenPending" class="inline-flex items-center ml-1 text-gray-400"><i class="ph-bold ph-spinner animate-spin text-[12px]"></i></span>
            <button
              class="ml-1.5 opacity-0 group-hover/reply:opacity-100 text-gray-400 hover:text-red-500 transition-all"
              @click="$emit('delete-reply', moment.id, reply.id)"
            >
              <i class="ph-fill ph-x-circle text-sm align-middle"></i>
            </button>
          </div>
          <button v-if="moment.replies.length > 3" class="text-[12px] text-blue-500" @click="$emit('open-detail', moment.id)">
            查看全部 {{ moment.replies.length }} 条评论
          </button>
        </div>

        <!-- Inline Reply Input -->
        <div class="flex items-center gap-2 mb-2">
          <div class="flex-1 relative">
            <input
              ref="replyInputEl"
              v-model="replyText"
              type="text"
              placeholder="评论..."
              class="w-full bg-gray-100 dark:bg-white/[0.06] rounded-full pl-3.5 pr-9 py-1.5 text-[13px] outline-none dark:text-white placeholder-gray-400"
              @keyup.enter="submitReply"
            >
            <button
              v-if="replyText"
              class="absolute right-1.5 top-1/2 -translate-y-1/2 text-pink-500 p-0.5"
              @click="submitReply"
            >
              <i class="ph-bold ph-paper-plane-right"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  </article>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useContactsStore } from '../../../stores/contacts'
import { formatRelativeTime } from '../../../utils/relativeTime'
import MomentVoiceBubble from './MomentVoiceBubble.vue'

const props = defineProps({
  moment: { type: Object, required: true }
})

const emit = defineEmits(['delete', 'delete-reply', 'like', 'reply', 'open-detail'])

const contactsStore = useContactsStore()
const replyText = ref('')
const replyInputEl = ref(null)

const imageTileCount = computed(() => {
  const imgCount = Math.min((props.moment.images || []).length, 9)
  return Math.min(imgCount + (props.moment.imageGenPending || 0), 9)
})

const pendingTileCount = computed(() => {
  const imgCount = Math.min((props.moment.images || []).length, 9)
  return Math.max(0, Math.min(props.moment.imageGenPending || 0, 9 - imgCount))
})

const likedByLabel = computed(() => {
  const names = []
  if (Array.isArray(props.moment.likedBy)) {
    props.moment.likedBy.forEach(id => {
      const contact = contactsStore.contacts.find(c => c.id === id)
      if (contact?.name) names.push(contact.name)
    })
  }
  if (props.moment.isLiked) names.push('我')
  if (names.length === 0) return ''
  return names.slice(0, 5).join('、') + (names.length > 5 ? ` 等${names.length}人` : '') + ' 觉得很赞'
})

function isImageLikeUrl(value) {
  const text = String(value || '').trim()
  return text.startsWith('data:') || text.startsWith('blob:') || /^https?:\/\//i.test(text)
}

function isUserAuthor(authorId) {
  return !contactsStore.contacts.some(c => c.id === authorId)
}

function imageGridClass(count) {
  if (count === 1) return 'grid-cols-1 max-w-[220px]'
  if (count === 2 || count === 4) return 'grid-cols-2 max-w-[260px]'
  return 'grid-cols-3 max-w-[320px]'
}

function formatTime(ts) {
  return formatRelativeTime(ts)
}

function focusReply() {
  replyInputEl.value?.focus()
}

function submitReply() {
  const content = replyText.value.trim()
  if (!content) return
  emit('reply', props.moment.id, content)
  replyText.value = ''
}
</script>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.gen-pending-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  background: linear-gradient(135deg, rgba(236, 72, 153, 0.08), rgba(139, 92, 246, 0.08));
}
</style>
