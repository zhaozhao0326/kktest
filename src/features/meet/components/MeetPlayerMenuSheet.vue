<template>
  <Transition name="menu-sheet">
    <div v-if="visible" class="meet-menu-backdrop" @click.stop="emit('close')">
      <div class="meet-menu-container" @click.stop>
        <div class="menu-handle"></div>

        <div class="menu-group">
          <button class="menu-item" @click.stop="emit('open-save')">
            <span class="menu-item-icon"><i class="ph ph-archive"></i></span>
            <span class="menu-item-label">存档读档</span>
            <i class="ph-bold ph-caret-right menu-item-arrow"></i>
          </button>
          <button class="menu-item" @click.stop="emit('open-history')">
            <span class="menu-item-icon"><i class="ph ph-clock-counter-clockwise"></i></span>
            <span class="menu-item-label">历史回溯</span>
            <i class="ph-bold ph-caret-right menu-item-arrow"></i>
          </button>
        </div>

        <div class="menu-group">
          <button class="menu-item" @click.stop="emit('toggle-auto-play')">
            <span class="menu-item-icon" :class="{ on: isAutoPlay }">
              <i :class="isAutoPlay ? 'ph-fill ph-pause' : 'ph-fill ph-play'"></i>
            </span>
            <span class="menu-item-label">{{ isAutoPlay ? '停止自动播放' : '自动播放' }}</span>
            <span v-if="isAutoPlay" class="menu-item-state">进行中</span>
          </button>
          <button class="menu-item" @click.stop="emit('toggle-tts')">
            <span class="menu-item-icon" :class="{ on: isTtsEnabled }">
              <i :class="isTtsEnabled ? 'ph-fill ph-speaker-high' : 'ph ph-speaker-slash'"></i>
            </span>
            <span class="menu-item-label">{{ isTtsEnabled ? '关闭朗读' : '开启朗读' }}</span>
            <span v-if="isTtsEnabled" class="menu-item-state">已开启</span>
          </button>
          <button class="menu-item" @click.stop="emit('show-mood-details')">
            <span class="menu-item-icon rose"><i class="ph-fill ph-heart"></i></span>
            <span class="menu-item-label">好感度</span>
            <i class="ph-bold ph-caret-right menu-item-arrow"></i>
          </button>
        </div>

        <div class="menu-group">
          <button class="menu-item" @click.stop="confirmRestart">
            <span class="menu-item-icon"><i class="ph ph-arrow-counter-clockwise"></i></span>
            <span class="menu-item-label">重新开始</span>
          </button>
          <button class="menu-item danger" @click.stop="confirmLeave">
            <span class="menu-item-icon danger"><i class="ph ph-door-open"></i></span>
            <span class="menu-item-label">离开约会</span>
          </button>
        </div>

        <button class="menu-close-btn" @click.stop="emit('close')">返回约会</button>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { showConfirm } from '../../../composables/useConfirm'

defineProps({
  visible: { type: Boolean, default: false },
  isAutoPlay: { type: Boolean, default: false },
  isTtsEnabled: { type: Boolean, default: false }
})

const emit = defineEmits([
  'close',
  'leave',
  'open-history',
  'open-save',
  'restart',
  'show-mood-details',
  'toggle-auto-play',
  'toggle-tts'
])

async function confirmRestart() {
  const ok = await showConfirm({
    title: '重新开始',
    message: '当前进度将被清空并重新生成剧情，确定重新开始？',
    confirmText: '重新开始',
    destructive: true
  })
  if (ok) emit('restart')
}

async function confirmLeave() {
  const ok = await showConfirm({
    title: '离开约会',
    message: '进度会自动保留，确定离开当前约会？',
    confirmText: '离开'
  })
  if (ok) emit('leave')
}
</script>

<style scoped>
.meet-menu-backdrop {
  position: absolute;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.meet-menu-container {
  width: 100%;
  max-width: 500px;
  max-height: 82vh;
  overflow-y: auto;
  background: rgba(28, 26, 38, 0.92);
  backdrop-filter: blur(36px) saturate(160%);
  -webkit-backdrop-filter: blur(36px) saturate(160%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-bottom: none;
  border-radius: 28px 28px 0 0;
  padding: 10px 20px calc(28px + env(safe-area-inset-bottom, 0px));
}

.meet-menu-container::-webkit-scrollbar { display: none; }

.menu-handle {
  width: 40px;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.2);
  margin: 0 auto 16px;
}

.menu-group {
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  overflow: hidden;
  margin-bottom: 12px;
}

.menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 13px 16px;
  background: transparent;
  border: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.88);
  font-size: 14.5px;
  font-weight: 500;
  letter-spacing: 1px;
  text-align: left;
  cursor: pointer;
  transition: background 0.2s ease;
}

.menu-item:last-child { border-bottom: none; }

.menu-item:active { background: rgba(255, 255, 255, 0.08); }

.menu-item-icon {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.07);
  transition: all 0.2s ease;
}

.menu-item-icon.on {
  background: rgba(244, 114, 182, 0.18);
  color: #f9a8d4;
}

.menu-item-icon.rose {
  color: #f472b6;
}

.menu-item-icon.danger {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

.menu-item-label {
  flex: 1;
  min-width: 0;
}

.menu-item-state {
  flex-shrink: 0;
  font-size: 11px;
  color: #f9a8d4;
  letter-spacing: 1px;
}

.menu-item-arrow {
  flex-shrink: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.22);
}

.menu-item.danger .menu-item-label {
  color: #ef4444;
}

.menu-close-btn {
  width: 100%;
  height: 48px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.6);
  font-weight: 600;
  font-size: 14px;
  letter-spacing: 3px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.menu-close-btn:active {
  transform: scale(0.98);
  background: rgba(255, 255, 255, 0.12);
}

.menu-sheet-enter-active {
  transition: opacity 0.3s;
}

.menu-sheet-leave-active {
  transition: opacity 0.2s;
}

.menu-sheet-enter-from,
.menu-sheet-leave-to {
  opacity: 0;
}

.menu-sheet-enter-active .meet-menu-container {
  transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

.menu-sheet-leave-active .meet-menu-container {
  transition: transform 0.3s ease-in;
}

.menu-sheet-enter-from .meet-menu-container,
.menu-sheet-leave-to .meet-menu-container {
  transform: translateY(100%);
}
</style>
