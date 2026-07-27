<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'

const props = defineProps({
  text: { type: String, default: '' },
  textSpeed: { type: Number, default: 30 },
  isPlaying: { type: Boolean, default: false }
})

const emit = defineEmits(['complete'])

const displayText = ref('')
let timer = null
let completedForText = ''

function stopTimer() {
  if (timer) clearInterval(timer)
  timer = null
}

function completeNow() {
  stopTimer()
  displayText.value = props.text || ''
  if (props.text && completedForText !== props.text) {
    completedForText = props.text
    emit('complete')
  }
}

function startTyping(text) {
  stopTimer()
  completedForText = ''
  displayText.value = ''
  if (!text) { emit('complete'); return }

  const speed = Math.max(10, Number(props.textSpeed || 30))
  let i = 0
  timer = setInterval(() => {
    if (!props.isPlaying) { completeNow(); return }
    i += 1
    displayText.value = text.slice(0, i)
    if (i >= text.length) {
      stopTimer()
      completedForText = text
      emit('complete')
    }
  }, speed)
}

watch(() => props.text, (t) => {
  if (t == null) return
  startTyping(String(t))
}, { immediate: true })

watch(() => props.isPlaying, (v) => {
  if (v === false && props.text && displayText.value !== props.text) {
    completeNow()
  }
})

onBeforeUnmount(() => stopTimer())
</script>

<template>
  <div class="meet-narration-overlay">
    <div class="meet-narration-panel">
      <div class="meet-narration-ornament">
        <i class="ph ph-sparkle"></i>
      </div>
      <div class="meet-narration-body">
        <p class="meet-narration-text">
          {{ displayText }}<span v-if="isPlaying && displayText" class="meet-cursor">|</span>
        </p>
      </div>
      <div class="meet-narration-ornament bottom">
        <i class="ph ph-sparkle"></i>
      </div>
      <div v-if="!isPlaying && displayText" class="meet-narration-hint">
        点击继续
      </div>
    </div>
  </div>
</template>

<style scoped>
.meet-narration-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 35;
  pointer-events: none;
  padding: 40px 24px;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.meet-narration-panel {
  position: relative;
  width: 100%;
  max-width: 680px;
  padding: 40px 32px;
  text-align: center;
  pointer-events: auto;
}

.meet-narration-ornament {
  color: rgba(255, 255, 255, 0.2);
  font-size: 24px;
  margin-bottom: 24px;
}

.meet-narration-ornament.bottom {
  margin-bottom: 0;
  margin-top: 24px;
}

.meet-narration-text {
  font-family: var(--meet-font, 'Noto Serif SC', 'SimSun', serif);
  font-size: 20px;
  line-height: 2.2;
  color: rgba(255, 255, 255, 0.92);
  font-style: italic;
  letter-spacing: 0.05em;
  white-space: pre-wrap;
  word-break: break-word;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.5);
}

.meet-cursor {
  color: rgba(255, 255, 255, 0.5);
  animation: cursorBlink 1s step-end infinite;
}

.meet-narration-hint {
  margin-top: 28px;
  font-size: 11px;
  letter-spacing: 0.3em;
  color: rgba(255, 255, 255, 0.3);
  animation: hintPulse 2s ease-in-out infinite;
}

@keyframes cursorBlink {
  from, to { opacity: 1; }
  50% { opacity: 0; }
}

@keyframes hintPulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.6; }
}
</style>
