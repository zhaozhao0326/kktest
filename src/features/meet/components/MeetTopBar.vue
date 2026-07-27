<script setup>
defineProps({
  location: { type: String, default: '' },
  timeOfDay: { type: String, default: '' },
  isGenerating: { type: Boolean, default: false }
})

const emit = defineEmits(['back', 'menu'])
</script>

<template>
  <div class="meet-top-bar">
    <button class="meet-glass-btn" @click="emit('back')">
      <i class="ph-bold ph-caret-left"></i>
    </button>

    <div class="meet-bar-center">
      <Transition name="pill-swap" mode="out-in">
        <div v-if="isGenerating" key="gen" class="meet-info-pill generating">
          <i class="ph ph-circle-notch spin"></i>
          <span>生成中…</span>
        </div>
        <div v-else-if="location || timeOfDay" key="info" class="meet-info-pill">
          <i class="ph-fill ph-map-pin"></i>
          <span class="pill-text">{{ location }}</span>
          <span v-if="location && timeOfDay" class="pill-dot"></span>
          <span v-if="timeOfDay" class="pill-time">{{ timeOfDay }}</span>
        </div>
      </Transition>
    </div>

    <button class="meet-glass-btn" @click="emit('menu')">
      <i class="ph-bold ph-list"></i>
    </button>
  </div>
</template>

<style scoped>
.meet-top-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: var(--app-pt-lg, 48px) 16px 12px;
  pointer-events: none;
}

.meet-glass-btn {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(16px) saturate(160%);
  -webkit-backdrop-filter: blur(16px) saturate(160%);
  cursor: pointer;
  pointer-events: auto;
  transition: transform 0.2s ease, background 0.2s ease;
}

.meet-glass-btn:active {
  transform: scale(0.88);
  background: rgba(255, 255, 255, 0.2);
}

.meet-bar-center {
  flex: 1;
  min-width: 0;
  display: flex;
  justify-content: center;
}

.meet-info-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  max-width: 100%;
  padding: 8px 16px;
  border-radius: 20px;
  background: rgba(0, 0, 0, 0.32);
  border: 1px solid rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(16px) saturate(160%);
  -webkit-backdrop-filter: blur(16px) saturate(160%);
  color: rgba(255, 255, 255, 0.85);
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 1px;
  pointer-events: auto;
  font-family: var(--meet-font, 'Noto Serif SC', 'SimSun', serif);
}

.meet-info-pill i {
  font-size: 13px;
  color: rgba(244, 114, 182, 0.85);
  flex-shrink: 0;
}

.pill-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pill-dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.35);
  flex-shrink: 0;
}

.pill-time {
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.6);
}

.meet-info-pill.generating {
  background: rgba(244, 114, 182, 0.18);
  border-color: rgba(244, 114, 182, 0.35);
  color: #fbcfe8;
}

.meet-info-pill.generating i {
  color: #f9a8d4;
}

.spin {
  animation: pillSpin 1s linear infinite;
}

@keyframes pillSpin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.pill-swap-enter-active,
.pill-swap-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.pill-swap-enter-from,
.pill-swap-leave-to {
  opacity: 0;
  transform: scale(0.92);
}
</style>
