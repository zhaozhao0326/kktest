<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'

const props = defineProps({
  name: { type: String, default: '' },
  nameColor: { type: String, default: '#fff' },
  text: { type: String, default: '' },
  textSpeed: { type: Number, default: 30 },
  isPlaying: { type: Boolean, default: false }
})

const emit = defineEmits(['complete'])

const displayText = ref('')
let timer = null
let completedForText = ''

// Characters default to nameColor '#fff' which is invisible on a light glass
// card — fall back to the rose accent for falsy/white colors.
const badgeColor = computed(() => {
  const c = String(props.nameColor || '').trim().toLowerCase()
  if (!c || c === '#fff' || c === '#ffffff' || c === 'white' || c === 'rgb(255,255,255)' || c === 'rgb(255, 255, 255)') {
    return '#f472b6'
  }
  return props.nameColor
})

const cssVars = computed(() => ({
  '--badge-bg': badgeColor.value
}))

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
  <div class="meet-dialog-wrapper" :style="cssVars">
    <div class="meet-dialog-panel">
      <!-- Name Tag - floating colored badge -->
      <div v-if="name" class="meet-name-tag">
        {{ name }}
      </div>

      <!-- Text Content -->
      <div class="meet-dialog-content">
        <p class="meet-dialog-text">
          {{ displayText }}<span v-if="isPlaying && displayText" class="meet-cursor"></span>
        </p>
      </div>

      <!-- Continue indicator -->
      <Transition name="fade">
        <div v-if="!isPlaying && displayText" class="meet-next-hint">
          <i class="ph ph-caret-double-down"></i>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.meet-dialog-wrapper {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  padding: 0 16px calc(var(--app-pb, 8px) + 20px);
  pointer-events: none;
}

.meet-dialog-panel {
  max-width: 640px;
  margin: 0 auto;
  min-height: 130px;
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 24px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.08),
    0 2px 8px rgba(0, 0, 0, 0.04),
    inset 0 1px 0 rgba(255, 255, 255, 0.6);
  padding: 28px 24px 26px;
  pointer-events: auto;
  position: relative;
  display: flex;
  flex-direction: column;
  font-family: var(--meet-font, 'Noto Serif SC', 'SimSun', serif);
}

.meet-name-tag {
  position: absolute;
  top: -14px;
  left: 32px;
  padding: 6px 20px;
  border-radius: 20px;
  background: var(--badge-bg, #f472b6);
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.1em;
  line-height: 1.3;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  font-family: var(--meet-font, 'Noto Serif SC', 'SimSun', serif);
  z-index: 2;
}

.meet-dialog-content {
  flex: 1;
  overflow-y: auto;
  margin-top: 4px;
}

.meet-dialog-content::-webkit-scrollbar { display: none; }

.meet-dialog-text {
  font-size: 16.5px;
  line-height: 1.9;
  color: rgba(30, 30, 50, 0.88);
  font-weight: 700;
  white-space: pre-wrap;
  word-break: break-word;
  letter-spacing: 0.02em;
}

.meet-cursor {
  display: inline-block;
  width: 2px;
  height: 1.1em;
  background: var(--badge-bg, #f472b6);
  margin-left: 3px;
  vertical-align: text-bottom;
  animation: cursorBlink 1s step-end infinite;
}

.meet-next-hint {
  position: absolute;
  right: 22px;
  bottom: 12px;
  color: rgba(30, 30, 50, 0.28);
  font-size: 18px;
  animation: hintBounce 2s ease-in-out infinite;
}

@keyframes cursorBlink {
  from, to { opacity: 1; }
  50% { opacity: 0; }
}

@keyframes hintBounce {
  0%, 100% { transform: translateY(0); opacity: 0.28; }
  50% { transform: translateY(5px); opacity: 0.65; }
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
