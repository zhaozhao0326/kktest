<template>
  <div class="meet-hub">
    <!-- Ambient layers -->
    <div class="hub-glow"></div>
    <div class="hub-noise"></div>

    <!-- Header -->
    <header class="hub-header">
      <button class="hub-round-btn" @click="router.push('/')">
        <i class="ph-bold ph-caret-left"></i>
      </button>
      <div class="hub-header-center">
        <h1 class="hub-title">见面</h1>
        <p class="hub-subtitle">{{ activeTab === 'vn' ? 'VISUAL NOVEL' : 'DATING STORY' }}</p>
      </div>
      <button
        v-if="activeTab === 'date'"
        class="hub-round-btn"
        @click="router.push('/meet/presets')"
      >
        <i class="ph-bold ph-faders"></i>
      </button>
      <button
        v-else
        class="hub-round-btn accent-vn"
        @click="router.push('/vn/wizard')"
      >
        <i class="ph-bold ph-plus"></i>
      </button>
    </header>

    <!-- Shared creation resources -->
    <MeetHomeResourceHub />

    <!-- Segmented control -->
    <div class="hub-seg-wrap">
      <div class="hub-seg" :data-active="activeTab">
        <div class="hub-seg-thumb" :class="{ right: activeTab === 'vn' }"></div>
        <button
          class="hub-seg-btn"
          :class="{ on: activeTab === 'date' }"
          @click="setTab('date')"
        >约会</button>
        <button
          class="hub-seg-btn"
          :class="{ on: activeTab === 'vn' }"
          @click="setTab('vn')"
        >视觉小说</button>
      </div>
    </div>

    <!-- Content -->
    <div class="hub-body">
      <Transition name="tab-fade" mode="out-in">
        <MeetHomeDatingTab v-if="activeTab === 'date'" key="date" />
        <MeetHomeVNTab v-else key="vn" />
      </Transition>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MeetHomeDatingTab from '../components/home/MeetHomeDatingTab.vue'
import MeetHomeResourceHub from '../components/home/MeetHomeResourceHub.vue'
import MeetHomeVNTab from '../components/home/MeetHomeVNTab.vue'

const router = useRouter()
const route = useRoute()

const TAB_STORAGE_KEY = 'meet-home-active-tab'

function normalizeTab(value) {
  return value === 'vn' || value === 'date' ? value : ''
}

function readStoredTab() {
  try {
    return normalizeTab(localStorage.getItem(TAB_STORAGE_KEY))
  } catch {
    return ''
  }
}

function persistTab(tab) {
  try {
    localStorage.setItem(TAB_STORAGE_KEY, tab)
  } catch {
    // Ignore unavailable storage (for example private browsing restrictions).
  }
}

const activeTab = ref(normalizeTab(route.query.tab) || readStoredTab() || 'date')

watch(() => route.query.tab, (tab) => {
  const next = normalizeTab(tab)
  if (next) activeTab.value = next
})

watch(activeTab, tab => persistTab(tab), { immediate: true })

function setTab(tab) {
  if (activeTab.value === tab) return
  router.replace({ query: { ...route.query, tab } })
}
</script>

<style scoped>
.meet-hub {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.92);
  background: linear-gradient(175deg, #101018 0%, #17141f 55%, #201828 100%);
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', sans-serif;
}

.hub-glow {
  position: absolute;
  top: -120px;
  left: 50%;
  width: 420px;
  height: 320px;
  transform: translateX(-50%);
  background: radial-gradient(ellipse at center, rgba(244, 114, 182, 0.14) 0%, transparent 65%);
  pointer-events: none;
  z-index: 0;
}

.hub-noise {
  position: absolute;
  inset: 0;
  z-index: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.04'/%3E%3C/svg%3E");
  pointer-events: none;
}

/* Header */
.hub-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: var(--app-pt-lg, 48px) 20px 8px;
  position: relative;
  z-index: 2;
}

.hub-header-center {
  flex: 1;
  text-align: center;
  min-width: 0;
}

.hub-title {
  font-family: 'Noto Serif SC', 'SimSun', serif;
  font-size: 1.45rem;
  font-weight: 700;
  letter-spacing: 10px;
  margin-left: 10px;
  color: #fff;
  line-height: 1.2;
}

.hub-subtitle {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.3em;
  margin-left: 0.3em;
  color: rgba(255, 255, 255, 0.28);
  margin-top: 2px;
}

.hub-round-btn {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  color: rgba(255, 255, 255, 0.85);
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  cursor: pointer;
  transition: transform 0.2s ease, background 0.2s ease;
}

.hub-round-btn:active {
  transform: scale(0.9);
  background: rgba(255, 255, 255, 0.14);
}

.hub-round-btn.accent-vn {
  background: linear-gradient(135deg, rgba(129, 140, 248, 0.85), rgba(99, 102, 241, 0.85));
  border-color: rgba(129, 140, 248, 0.45);
  color: #fff;
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.35);
}

/* Segmented control */
.hub-seg-wrap {
  flex-shrink: 0;
  padding: 10px 20px 4px;
  position: relative;
  z-index: 2;
}

.hub-seg {
  position: relative;
  display: flex;
  height: 42px;
  border-radius: 21px;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  overflow: hidden;
}

.hub-seg-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: calc(50% - 3px);
  height: calc(100% - 6px);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
  transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

.hub-seg-thumb.right {
  transform: translateX(100%);
}

.hub-seg-btn {
  position: relative;
  z-index: 1;
  flex: 1;
  border: none;
  background: transparent;
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: 2px;
  color: rgba(255, 255, 255, 0.45);
  cursor: pointer;
  transition: color 0.25s ease;
}

.hub-seg-btn.on {
  color: #fff;
}

/* Body */
.hub-body {
  flex: 1;
  min-height: 0;
  position: relative;
  z-index: 1;
}

/* Tab cross-fade */
.tab-fade-enter-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}
.tab-fade-leave-active {
  transition: opacity 0.15s ease;
}
.tab-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.tab-fade-leave-to {
  opacity: 0;
}
</style>
