<template>
  <div v-if="visible" class="absolute inset-0 z-50 flex flex-col bg-white dark:bg-[#1C1C1E]">
    <div class="px-4 pt-app pb-2 flex items-center justify-between">
      <button class="text-[16px] text-gray-600 dark:text-gray-400" @click="close">取消</button>
      <button
        class="bg-gradient-to-r from-pink-500 to-violet-500 text-white text-[14px] font-bold px-5 py-1.5 rounded-full disabled:opacity-50 disabled:scale-100 active:scale-95 transition-all"
        :disabled="!canSubmit"
        @click="submit"
      >
        发布
      </button>
    </div>

    <div class="flex-1 overflow-y-auto px-5 py-2">
      <!-- Identity Selector -->
      <div class="flex items-center gap-3 mb-4 overflow-x-auto no-scrollbar py-2">
        <div
          class="flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all cursor-pointer"
          :class="form.authorType === 'user' ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/20' : 'border-gray-200 dark:border-gray-700'"
          @click="form.authorType = 'user'"
        >
           <div class="w-6 h-6 rounded-full bg-gray-200 overflow-hidden">
              <img v-if="userAvatar" :src="userAvatar" class="w-full h-full object-cover">
           </div>
           <span class="text-sm font-medium whitespace-nowrap" :class="form.authorType === 'user' ? 'text-pink-600 dark:text-pink-400' : 'text-gray-600 dark:text-gray-300'">{{ userName || '本体' }}</span>
         </div>

        <div
           v-for="c in contacts"
          :key="c.id"
          class="flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all cursor-pointer"
          :class="form.authorType === 'contact:' + c.id ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20' : 'border-gray-200 dark:border-gray-700'"
          @click="form.authorType = 'contact:' + c.id"
        >
           <div class="w-6 h-6 rounded-full bg-gray-200 overflow-hidden">
              <template v-if="c.avatar">
                 <img v-if="isImageLikeUrl(c.avatar)" :src="c.avatar" class="w-full h-full object-cover">
                 <span v-else class="flex items-center justify-center w-full h-full text-[10px]">{{ c.avatar }}</span>
              </template>
           </div>
           <span class="text-sm font-medium whitespace-nowrap" :class="form.authorType === 'contact:' + c.id ? 'text-purple-600 dark:text-purple-400' : 'text-gray-600 dark:text-gray-300'">{{ c.name }}</span>
        </div>
      </div>

      <!-- Mood Selector -->
      <div class="flex items-center gap-2 mb-4 overflow-x-auto no-scrollbar">
        <span class="text-[12px] text-gray-400 shrink-0">心情</span>
        <button
          v-for="emoji in moods" :key="emoji"
          class="w-8 h-8 rounded-full flex items-center justify-center transition-all text-lg"
          :class="form.mood === emoji ? 'bg-pink-100 dark:bg-pink-900/30 scale-110' : 'hover:bg-gray-100 dark:hover:bg-gray-800'"
          @click="form.mood = form.mood === emoji ? '' : emoji"
        >{{ emoji }}</button>
      </div>

      <textarea
        v-model="form.content"
        class="w-full h-[28vh] text-[16px] leading-relaxed text-gray-800 dark:text-gray-200 placeholder-gray-400 outline-none resize-none bg-transparent"
        placeholder="分享你的想法..."
      ></textarea>

      <!-- Media Preview -->
      <div v-if="form.images.length > 0 || imageGenerating" class="grid grid-cols-3 gap-2 mb-3">
        <div v-for="(img, idx) in form.images" :key="idx" class="relative aspect-square rounded-xl overflow-hidden ring-1 ring-black/5">
          <img :src="img" class="w-full h-full object-cover">
          <button class="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center" @click="form.images.splice(idx, 1)">
            <i class="ph-bold ph-x text-xs"></i>
          </button>
        </div>
        <div v-if="imageGenerating" class="aspect-square rounded-xl gen-pending-tile">
          <i class="ph-bold ph-spinner animate-spin text-xl"></i>
          <span class="text-[11px] mt-1">生成中…</span>
        </div>
      </div>

      <div v-if="form.voiceText" class="mb-3 flex items-center gap-2">
        <MomentVoiceBubble
          :voice-text="form.voiceText"
          :voice-duration="0"
          :is-user="form.authorType === 'user'"
          :author-id="composerContactId"
        />
        <button class="text-gray-400 hover:text-red-500" @click="form.voiceText = ''">
          <i class="ph-fill ph-x-circle text-lg"></i>
        </button>
      </div>

      <!-- AI Image Prompt Row -->
      <div v-if="showAiImageInput" class="flex items-center gap-2 mb-3">
        <input
          v-model="aiImagePrompt"
          type="text"
          placeholder="描述想生成的图片（如：海边落日）"
          class="flex-1 bg-gray-100 dark:bg-white/[0.08] rounded-full px-4 py-2 text-[13px] outline-none dark:text-white"
          @keyup.enter="generateImage"
        >
        <button
          class="px-3.5 py-2 rounded-full bg-gradient-to-r from-pink-500 to-violet-500 text-white text-[12px] font-bold disabled:opacity-50 active:scale-95 transition-all"
          :disabled="imageGenerating || !aiImagePrompt.trim()"
          @click="generateImage"
        >
          {{ imageGenerating ? '生成中' : '生成' }}
        </button>
      </div>
      <div v-if="errorText" class="mb-3 text-[12px] text-red-500">{{ errorText }}</div>

      <!-- Toolbar -->
      <div class="flex gap-5 mt-2 pt-4 border-t border-gray-100 dark:border-white/10 text-2xl text-gray-400">
         <button class="hover:text-pink-500 transition-colors" title="上传图片" @click="fileInput?.click()">
           <i class="ph ph-image"></i>
         </button>
         <button
           v-if="allowAiImage"
           class="transition-colors"
           :class="showAiImageInput ? 'text-pink-500' : 'hover:text-pink-500'"
           title="AI 生成图片"
           @click="showAiImageInput = !showAiImageInput"
         >
           <i class="ph ph-sparkle"></i>
         </button>
         <button class="hover:text-pink-500 transition-colors" title="语音" @click="showVoiceModal = true">
           <i class="ph ph-microphone"></i>
         </button>
         <input
           ref="fileInput"
           type="file"
           accept="image/*"
           multiple
           class="hidden"
           @change="onImagePick"
         >
      </div>
    </div>

    <VoiceModal
      :visible="showVoiceModal"
      @cancel="showVoiceModal = false"
      @send="onVoice"
    />
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { generateMomentImage } from '../../../composables/imageGen/momentsMedia'
import VoiceModal from '../../../components/common/VoiceModal.vue'
import MomentVoiceBubble from './MomentVoiceBubble.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  contacts: { type: Array, default: () => [] },
  userName: { type: String, default: '' },
  userAvatar: { type: String, default: '' },
  allowAiImage: { type: Boolean, default: false },
  resolveAuthor: { type: Function, required: true }
})

const emit = defineEmits(['close', 'submit'])

const moods = ['😊', '😢', '😡', '🥰', '😴', '🤔', '🎉', '🌸']
const form = reactive({ content: '', authorType: 'user', mood: '', images: [], voiceText: '' })
const fileInput = ref(null)
const showAiImageInput = ref(false)
const aiImagePrompt = ref('')
const imageGenerating = ref(false)
const errorText = ref('')
const showVoiceModal = ref(false)

const composerContactId = computed(() => {
  const type = form.authorType || 'user'
  return type.startsWith('contact:') ? type.slice('contact:'.length) : ''
})

const canSubmit = computed(() => {
  return !!(form.content.trim() || form.images.length > 0 || form.voiceText)
})

function isImageLikeUrl(value) {
  const text = String(value || '').trim()
  return text.startsWith('data:') || text.startsWith('blob:') || /^https?:\/\//i.test(text)
}

function onImagePick(event) {
  const files = Array.from(event.target?.files || [])
  files.slice(0, 9 - form.images.length).forEach(file => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string' && form.images.length < 9) {
        form.images.push(reader.result)
      }
    }
    reader.readAsDataURL(file)
  })
  if (event.target) event.target.value = ''
}

async function generateImage() {
  const tags = aiImagePrompt.value.trim()
  if (!tags || imageGenerating.value) return
  imageGenerating.value = true
  errorText.value = ''
  try {
    const author = props.resolveAuthor(form.authorType || 'user')
    const { url } = await generateMomentImage({
      contactId: composerContactId.value,
      tags,
      contactName: author?.name || '',
      contactAvatar: author?.avatar || null
    })
    if (form.images.length < 9) form.images.push(url)
    aiImagePrompt.value = ''
    showAiImageInput.value = false
  } catch (error) {
    errorText.value = '图片生成失败：' + String(error?.message || '未知错误')
  } finally {
    imageGenerating.value = false
  }
}

function onVoice({ text }) {
  form.voiceText = String(text || '').trim()
  showVoiceModal.value = false
}

function reset() {
  form.content = ''
  form.mood = ''
  form.authorType = 'user'
  form.images = []
  form.voiceText = ''
  aiImagePrompt.value = ''
  showAiImageInput.value = false
  errorText.value = ''
}

function close() {
  reset()
  emit('close')
}

function submit() {
  if (!canSubmit.value) return
  emit('submit', {
    authorType: form.authorType || 'user',
    content: form.content.trim(),
    mood: form.mood || null,
    images: [...form.images],
    voiceText: form.voiceText || null
  })
  reset()
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
