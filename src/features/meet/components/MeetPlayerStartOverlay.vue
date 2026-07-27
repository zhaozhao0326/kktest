<template>
  <Transition name="fade-start">
    <div v-if="visible" class="meet-start-screen" @click.stop>
      <div class="start-card">
        <h1 class="start-title">{{ title }}</h1>
        <div v-if="location" class="start-location">
          <i class="ph ph-map-pin-fill"></i> {{ location }}
        </div>
        <p class="start-desc">{{ description }}</p>
        <div class="start-actions">
          <button class="btn-setup" @click.stop="emit('setup')">配置</button>
          <button class="btn-start" :disabled="isGenerating" @click.stop="emit('start')">
            {{ startActionLabel }}
          </button>
          <button v-if="hasHistory" class="btn-restart" :disabled="isGenerating" @click.stop="emit('restart')">
            重新开始
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
defineProps({
  description: { type: String, default: '' },
  hasHistory: { type: Boolean, default: false },
  isGenerating: { type: Boolean, default: false },
  location: { type: String, default: '' },
  startActionLabel: { type: String, default: '开始约会' },
  title: { type: String, default: '约会' },
  visible: { type: Boolean, default: false }
})

const emit = defineEmits(['restart', 'setup', 'start'])
</script>

<style scoped>
.meet-start-screen {
  position: absolute;
  inset: 0;
  z-index: 110;
  background: rgba(10, 8, 18, 0.72);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 30px 24px;
}

.start-card {
  position: relative;
  width: 100%;
  max-width: 400px;
  background: rgba(28, 26, 38, 0.85);
  backdrop-filter: blur(32px) saturate(160%);
  -webkit-backdrop-filter: blur(32px) saturate(160%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 28px;
  padding: 44px 28px 28px;
  text-align: center;
  box-shadow:
    0 24px 60px rgba(0, 0, 0, 0.45),
    0 0 80px rgba(244, 114, 182, 0.12);
  font-family: var(--meet-font, 'Noto Serif SC', 'SimSun', serif);
  overflow: hidden;
}

.start-card::before {
  content: '';
  position: absolute;
  top: -60px;
  left: 50%;
  width: 260px;
  height: 160px;
  transform: translateX(-50%);
  background: radial-gradient(ellipse at center, rgba(244, 114, 182, 0.22) 0%, transparent 70%);
  pointer-events: none;
}

.start-title {
  position: relative;
  font-size: 1.55rem;
  font-weight: 700;
  letter-spacing: 4px;
  margin-bottom: 10px;
  background: linear-gradient(135deg, #fdf2f8, #f9a8d4);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
}

.start-location {
  position: relative;
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  letter-spacing: 2px;
}

.start-location i { color: rgba(244, 114, 182, 0.75); }

.start-desc {
  position: relative;
  margin: 22px 0 30px;
  color: rgba(255, 255, 255, 0.55);
  font-size: 0.85rem;
  line-height: 1.7;
  letter-spacing: 1px;
}

.start-actions {
  position: relative;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.start-actions button {
  height: 50px;
  font-weight: 700;
  font-size: 0.95rem;
  font-family: var(--meet-font, 'Noto Serif SC', 'SimSun', serif);
  letter-spacing: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-setup {
  flex: 1;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.75);
}

.btn-start {
  flex: 2;
  border-radius: 22px;
  background: linear-gradient(135deg, #f472b6, #db2777);
  border: none;
  color: #fff;
  box-shadow: 0 8px 24px rgba(219, 39, 119, 0.35);
}

.btn-start:active,
.btn-setup:active {
  transform: scale(0.96);
}

.btn-start:disabled {
  opacity: 0.4;
  box-shadow: none;
}

.btn-restart {
  width: 100%;
  height: 44px;
  border-radius: 20px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.45);
  font-size: 0.82rem;
  letter-spacing: 2px;
}

.btn-restart:active {
  transform: scale(0.97);
  color: rgba(255, 255, 255, 0.7);
}

.btn-restart:disabled {
  opacity: 0.45;
}

.fade-start-enter-active {
  transition: opacity 0.4s ease;
}

.fade-start-leave-active {
  transition: opacity 0.3s ease;
}

.fade-start-enter-from,
.fade-start-leave-to {
  opacity: 0;
}
</style>
