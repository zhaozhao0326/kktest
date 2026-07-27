<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  moodValues: { type: Object, default: () => ({}) },
  max: { type: Number, default: 5 }
})

const floats = ref([])
let floatId = 0

// Watch for mood value changes and create floating notifications
watch(() => props.moodValues, (newVal, oldVal) => {
  if (!oldVal || !newVal) return
  for (const name of Object.keys(newVal)) {
    const prev = oldVal[name] ?? 0
    const curr = newVal[name] ?? 0
    const diff = curr - prev
    if (diff !== 0) {
      const id = ++floatId
      floats.value.push({ id, name, diff, show: true })
      setTimeout(() => {
        const idx = floats.value.findIndex(f => f.id === id)
        if (idx !== -1) floats.value[idx].show = false
      }, 2000)
      setTimeout(() => {
        const idx = floats.value.findIndex(f => f.id === id)
        if (idx !== -1) floats.value.splice(idx, 1)
      }, 2500)
    }
  }
}, { deep: true })

const showDetails = ref(false)
</script>

<template>
  <!-- Floating change notifications -->
  <div class="meet-mood-floats">
    <TransitionGroup name="mood-float">
      <div
        v-for="f in floats"
        :key="f.id"
        class="mood-float-bubble"
        :class="{ positive: f.diff > 0, negative: f.diff < 0 }"
      >
        <span class="mood-float-name">{{ f.name }}</span>
        <span class="mood-float-value">{{ f.diff > 0 ? '+' : '' }}{{ f.diff }}</span>
        <span class="mood-float-heart">&#9829;</span>
      </div>
    </TransitionGroup>
  </div>

  <!-- Detail panel (toggled via menu) -->
  <Transition name="mood-detail">
    <div v-if="showDetails" class="mood-detail-overlay" @click="showDetails = false">
      <div class="mood-detail-panel" @click.stop>
        <div class="mood-detail-title">好感度</div>
        <div
          v-for="(value, name) in moodValues"
          :key="name"
          class="mood-detail-row"
        >
          <span class="mood-detail-name">{{ name }}</span>
          <div class="mood-detail-hearts">
            <i
              v-for="i in max"
              :key="i"
              class="ph-heart"
              :class="[i <= value ? 'ph-fill filled' : 'ph empty']"
            ></i>
          </div>
          <span class="mood-detail-num">{{ value }}/{{ max }}</span>
        </div>
        <button class="mood-detail-close" @click="showDetails = false">关闭</button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* Floating notifications */
.meet-mood-floats {
  position: absolute;
  top: 100px;
  right: 16px;
  z-index: 25;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
  pointer-events: none;
  font-family: var(--meet-font, 'Noto Serif SC', 'SimSun', serif);
}

.mood-float-bubble {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 18px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(16px) saturate(160%);
  -webkit-backdrop-filter: blur(16px) saturate(160%);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  pointer-events: auto;
}

.mood-float-bubble.positive {
  border-color: rgba(244, 114, 182, 0.4);
  background: rgba(244, 114, 182, 0.16);
}

.mood-float-name {
  font-size: 0.8rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.75);
  letter-spacing: 2px;
}

.mood-float-value {
  font-size: 0.85rem;
  font-weight: 700;
}

.positive .mood-float-value { color: #f9a8d4; }
.negative .mood-float-value { color: rgba(255, 255, 255, 0.45); }

.mood-float-heart {
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.35);
}

.positive .mood-float-heart { color: #f472b6; }

/* Float transition */
.mood-float-enter-active { transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
.mood-float-leave-active { transition: all 0.4s ease; }
.mood-float-enter-from { transform: translateX(40px); opacity: 0; }
.mood-float-leave-to { transform: translateX(20px); opacity: 0; }

/* Detail overlay */
.mood-detail-overlay {
  position: absolute;
  inset: 0;
  z-index: 80;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.mood-detail-panel {
  width: 100%;
  max-width: 360px;
  border-radius: 24px;
  background: rgba(28, 26, 38, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(32px) saturate(160%);
  -webkit-backdrop-filter: blur(32px) saturate(160%);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
  padding: 24px 22px;
  font-family: var(--meet-font, 'Noto Serif SC', 'SimSun', serif);
}

.mood-detail-title {
  font-size: 1rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.92);
  margin-bottom: 18px;
  letter-spacing: 6px;
  text-align: center;
}

.mood-detail-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}

.mood-detail-row:last-of-type { border-bottom: none; }

.mood-detail-name {
  font-size: 0.85rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.8);
  min-width: 60px;
  letter-spacing: 2px;
}

.mood-detail-hearts {
  flex: 1;
  display: flex;
  gap: 4px;
}

.mood-detail-hearts i {
  font-size: 15px;
  transition: all 0.3s;
}

.filled {
  color: #f472b6;
  filter: drop-shadow(0 0 6px rgba(244, 114, 182, 0.4));
}

.empty {
  color: rgba(255, 255, 255, 0.15);
}

.mood-detail-num {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.45);
  min-width: 30px;
  text-align: right;
}

.mood-detail-close {
  width: 100%;
  margin-top: 18px;
  padding: 12px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.9rem;
  font-weight: 700;
  font-family: var(--meet-font, 'Noto Serif SC', 'SimSun', serif);
  letter-spacing: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.mood-detail-close:active { transform: scale(0.98); background: rgba(255, 255, 255, 0.14); }

/* Detail transition */
.mood-detail-enter-active { transition: opacity 0.3s; }
.mood-detail-leave-active { transition: opacity 0.2s; }
.mood-detail-enter-from, .mood-detail-leave-to { opacity: 0; }
</style>
