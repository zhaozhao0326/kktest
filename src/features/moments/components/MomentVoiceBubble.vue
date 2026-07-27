<template>
  <div
    class="voice-pill inline-flex flex-col rounded-2xl transition-all select-none cursor-pointer max-w-full"
    :class="[
      compact ? 'px-2.5 py-1' : 'px-3.5 py-2',
      playing
        ? 'bg-gradient-to-r from-pink-500 to-violet-500 text-white shadow-lg shadow-pink-500/25'
        : 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/15'
    ]"
    @click.stop="expanded = !expanded"
  >
    <div class="inline-flex items-center gap-2">
      <button
        class="flex items-center justify-center active:scale-90 transition-transform"
        @click.stop="togglePlay"
      >
        <i
          v-if="loading"
          class="ph ph-circle-notch animate-spin"
          :class="compact ? 'text-[12px]' : 'text-[14px]'"
        ></i>
        <i
          v-else
          :class="[
            playing ? 'ph-fill ph-pause' : 'ph-fill ph-play',
            compact ? 'text-[12px]' : 'text-[14px]'
          ]"
        ></i>
      </button>
      <span class="flex items-end gap-[2px]" :class="compact ? 'h-3' : 'h-4'">
        <span
          v-for="(h, i) in bars"
          :key="i"
          class="rounded-full transition-colors"
          :class="[
            compact ? 'w-[2px]' : 'w-[3px]',
            playing ? 'bg-white/90 voice-bar-anim' : 'bg-gray-400/70 dark:bg-gray-500'
          ]"
          :style="{ height: Math.round(h * (compact ? 0.55 : 0.8)) + 'px', animationDelay: (i * 0.08) + 's' }"
        ></span>
      </span>
      <span class="font-medium tabular-nums" :class="compact ? 'text-[11px]' : 'text-[12px]'">{{ duration }}"</span>
    </div>
    <div
      v-if="expanded"
      class="whitespace-pre-wrap break-words border-t mt-1.5 pt-1.5"
      :class="[
        compact ? 'text-[12px]' : 'text-[13px]',
        playing ? 'border-white/25 text-white/95' : 'border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300'
      ]"
    >{{ voiceText }}</div>
  </div>
</template>

<script setup>
import { computed, ref, onBeforeUnmount } from 'vue'
import { useVoicePlayback } from '../../../composables/useVoicePlayback'
import { generateWaveform } from '../../../utils/voiceWaveform'
import { estimateMomentVoiceDuration } from '../../../utils/momentMedia'

const props = defineProps({
  voiceText: { type: String, required: true },
  voiceEmotion: { type: String, default: '' },
  voiceDuration: { type: Number, default: 0 },
  authorId: { type: String, default: '' },
  isUser: { type: Boolean, default: false },
  compact: { type: Boolean, default: false }
})

const { play, stop } = useVoicePlayback()
const playing = ref(false)
const loading = ref(false)
const expanded = ref(false)

const duration = computed(() => {
  return props.voiceDuration > 0 ? Math.round(props.voiceDuration) : estimateMomentVoiceDuration(props.voiceText)
})

const bars = computed(() => generateWaveform(props.voiceText, props.compact ? 10 : 16))

async function togglePlay() {
  if (loading.value) return
  if (playing.value) {
    stop()
    playing.value = false
    return
  }
  loading.value = true
  expanded.value = true
  try {
    await play({
      contactId: props.isUser ? '' : props.authorId,
      isUser: props.isUser,
      text: props.voiceText,
      emotion: props.voiceEmotion || '',
      durationSec: duration.value,
      onEnded: () => { playing.value = false }
    })
    playing.value = true
  } catch (error) {
    console.warn('[moments-voice] play failed', error)
    playing.value = false
  } finally {
    loading.value = false
  }
}

onBeforeUnmount(() => {
  if (playing.value) stop()
})
</script>

<style scoped>
.voice-bar-anim {
  animation: voice-bounce 0.9s ease-in-out infinite alternate;
}
@keyframes voice-bounce {
  from { transform: scaleY(0.5); }
  to { transform: scaleY(1.15); }
}
</style>
