<template>
  <Transition name="vn-choices-fade">
    <div v-if="options?.length" class="vn-choices-overlay">
      <div class="vn-choices-list">
        <button
          v-for="(opt, idx) in options"
          :key="idx"
          class="vn-choice-card"
          :style="{ animationDelay: `${idx * 120}ms` }"
          @click.stop="emit('select', opt)"
        >
          <div class="vn-choice-num">{{ idx + 1 }}</div>
          <div class="vn-choice-body">
            <div class="vn-choice-label">{{ opt.text }}</div>
            <div v-if="opt.effect" class="vn-choice-hint">{{ opt.effect }}</div>
          </div>
          <i class="ph ph-caret-right vn-choice-arrow"></i>
        </button>

        <div
          class="vn-custom-choice"
          :style="{ animationDelay: `${(options?.length || 0) * 120 + 60}ms` }"
        >
          <input
            v-model="customText"
            type="text"
            class="vn-custom-choice-input"
            placeholder="自定义行动或台词…"
            @click.stop
            @keydown.enter.stop.prevent="sendCustom"
          >
          <button
            class="vn-custom-choice-send"
            :disabled="!customText.trim()"
            aria-label="提交自定义选项"
            @click.stop="sendCustom"
          >
            <i class="ph ph-arrow-right"></i>
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  options: { type: Array, default: () => [] }
})

const emit = defineEmits(['select', 'custom'])
const customText = ref('')

function sendCustom() {
  const text = customText.value.trim()
  if (!text) return
  customText.value = ''
  emit('custom', text)
}
</script>

<style scoped>
.vn-choices-overlay {
  position: absolute;
  inset: 0;
  z-index: 45;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}

.vn-choices-list {
  width: 100%;
  max-width: 420px;
  max-height: min(72vh, 560px);
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  padding: 4px;
}

.vn-choices-list::-webkit-scrollbar { width: 4px; }
.vn-choices-list::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); }

.vn-choice-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(16px) saturate(160%);
  -webkit-backdrop-filter: blur(16px) saturate(160%);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 20px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  text-align: left;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  animation: vnChoiceSlideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) backwards;
}

.vn-choice-card:active {
  transform: scale(0.97) translateX(4px);
  background: rgba(255, 255, 255, 0.25);
  border-color: rgba(255, 255, 255, 0.4);
}

.vn-choice-num {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  font-size: 13px;
  font-weight: 700;
  color: white;
  transition: transform 0.2s ease, background 0.2s ease;
}

.vn-choice-card:active .vn-choice-num {
  transform: scale(1.12);
  background: rgba(99, 102, 241, 0.45);
  border-color: rgba(129, 140, 248, 0.55);
}

.vn-choice-body {
  flex: 1;
  min-width: 0;
}

.vn-choice-label {
  font-size: 15px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
  line-height: 1.5;
}

.vn-choice-hint {
  margin-top: 3px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  font-style: italic;
}

.vn-choice-arrow {
  flex-shrink: 0;
  font-size: 16px;
  color: rgba(255, 255, 255, 0.3);
  transition: transform 0.2s ease;
}

.vn-choice-card:active .vn-choice-arrow {
  transform: translateX(3px);
  color: rgba(255, 255, 255, 0.6);
}

.vn-custom-choice {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 5px 5px 5px 18px;
  background: rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(16px) saturate(160%);
  -webkit-backdrop-filter: blur(16px) saturate(160%);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 24px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
  animation: vnChoiceSlideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) backwards;
}

.vn-custom-choice-input {
  flex: 1;
  min-width: 0;
  height: 38px;
  border: 0;
  outline: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.95);
  font-size: 14px;
}

.vn-custom-choice-input::placeholder { color: rgba(255, 255, 255, 0.38); }

.vn-custom-choice-send {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  background: linear-gradient(135deg, #818cf8, #6366f1);
  color: #fff;
  font-size: 16px;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(79, 70, 229, 0.35);
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.vn-custom-choice-send:active:not(:disabled) { transform: scale(0.88); }
.vn-custom-choice-send:disabled { cursor: default; opacity: 0.4; }

@keyframes vnChoiceSlideIn {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.vn-choices-fade-enter-active { transition: opacity 0.4s ease; }
.vn-choices-fade-leave-active { transition: opacity 0.25s ease; }
.vn-choices-fade-enter-from,
.vn-choices-fade-leave-to { opacity: 0; }
</style>
