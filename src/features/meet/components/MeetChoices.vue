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

<template>
  <div v-if="options?.length" class="meet-choices-layer">
    <div class="meet-choice-stack">
      <button
        v-for="(opt, idx) in options"
        :key="idx"
        class="meet-choice-btn animate-in"
        :style="{ animationDelay: `${idx * 80}ms` }"
        @click.stop="emit('select', opt)"
      >
        <span class="meet-choice-num">{{ idx + 1 }}</span>
        <span class="meet-choice-body">
          <span class="meet-choice-text">{{ opt.text }}</span>
          <span v-if="opt.effect" class="meet-choice-effect">{{ opt.effect }}</span>
        </span>
        <i class="ph ph-caret-right meet-choice-arrow"></i>
      </button>

      <!-- Custom Response -->
      <div class="meet-custom-input-box animate-in" :style="{ animationDelay: `${(options?.length || 0) * 80 + 60}ms` }">
        <input
          v-model="customText"
          type="text"
          class="meet-custom-input"
          placeholder="或者，你想说什么..."
          @click.stop
          @keydown.enter.stop="sendCustom"
        >
        <button class="meet-custom-send" @click.stop="sendCustom">
          <i class="ph ph-arrow-right"></i>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.meet-choices-layer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(var(--app-pb, 8px) + var(--kb-inset, 0px) + 118px);
  z-index: 40;
  display: flex;
  justify-content: center;
  padding: 0 clamp(12px, 4vw, 28px);
  pointer-events: none;
}

.meet-choice-stack {
  width: 100%;
  max-width: 560px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  pointer-events: auto;
  max-height: min(46vh, 380px);
  overflow-y: auto;
  padding-right: 4px;
}

.meet-choice-stack::-webkit-scrollbar {
  width: 4px;
}

.meet-choice-stack::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
}

.meet-choice-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(16px) saturate(160%);
  -webkit-backdrop-filter: blur(16px) saturate(160%);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 20px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
  color: #fff;
  text-align: left;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.meet-choice-btn:active {
  transform: scale(0.97) translateX(4px);
  background: rgba(255, 255, 255, 0.25);
  border-color: rgba(255, 255, 255, 0.4);
}

.meet-choice-num {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  font-size: 12.5px;
  font-weight: 700;
  color: #fff;
  transition: transform 0.15s ease;
}

.meet-choice-btn:active .meet-choice-num {
  transform: scale(0.88);
}

.meet-choice-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.meet-choice-text {
  font-size: 14.5px;
  font-weight: 600;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.95);
  white-space: normal;
  word-break: break-word;
}

.meet-choice-effect {
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.42);
  font-style: italic;
  font-weight: 400;
  letter-spacing: 0.5px;
}

.meet-choice-arrow {
  flex-shrink: 0;
  font-size: 15px;
  color: rgba(255, 255, 255, 0.3);
  transition: transform 0.2s ease;
}

.meet-choice-btn:active .meet-choice-arrow {
  transform: translateX(3px);
  color: rgba(255, 255, 255, 0.6);
}

.meet-custom-input-box {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin-top: 2px;
  padding: 5px 5px 5px 18px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(16px) saturate(160%);
  -webkit-backdrop-filter: blur(16px) saturate(160%);
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
}

.meet-custom-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  color: rgba(255, 255, 255, 0.92);
  font-size: 14px;
  height: 38px;
  letter-spacing: 0.5px;
}

.meet-custom-input::placeholder { color: rgba(255, 255, 255, 0.35); }

.meet-custom-send {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, #f472b6, #db2777);
  color: #fff;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(219, 39, 119, 0.35);
  transition: transform 0.2s ease;
}

.meet-custom-send:active { transform: scale(0.88); }

@keyframes slideIn {
  from { transform: translateY(12px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.animate-in {
  animation: slideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
}

@media (max-width: 420px) {
  .meet-choices-layer {
    bottom: calc(var(--app-pb, 8px) + var(--kb-inset, 0px) + 110px);
    padding: 0 10px;
  }

  .meet-choice-btn {
    padding: 12px 14px;
    gap: 11px;
  }

  .meet-choice-text {
    font-size: 13.5px;
  }

  .meet-custom-input {
    font-size: 13px;
  }
}
</style>
