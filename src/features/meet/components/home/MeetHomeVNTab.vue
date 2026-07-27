<template>
  <div class="vn-tab">
    <!-- Section title -->
    <div class="vn-section-title">我的剧本 · {{ projects.length }}</div>

    <!-- Empty state -->
    <div v-if="projects.length === 0" class="tab-empty">
      <div class="tab-empty-icon">
        <i class="ph ph-notebook"></i>
      </div>
      <p class="tab-empty-text">还没有剧本</p>
      <p class="tab-empty-hint">点击右上角 + 号，开始创造你的第一个视觉小说</p>
    </div>

    <!-- Project cards -->
    <div class="vn-project-list">
      <div
        v-for="p in projects"
        :key="p.id"
        class="vn-project-card"
      >
        <div class="vn-project-main" @click="goPlay(p.id)">
          <div class="vn-project-thumb">
            <i class="ph ph-game-controller"></i>
          </div>
          <div class="vn-project-info">
            <div class="vn-project-name">{{ p.name }}</div>
            <div class="vn-project-desc">{{ p.worldSetting || '自由剧情' }}</div>
            <div class="vn-project-meta">
              <span><i class="ph ph-users"></i>{{ (p.characters || []).length }}</span>
              <span><i class="ph ph-clock"></i>{{ formatTime(p.updatedAt) }}</span>
            </div>
          </div>
          <div class="vn-project-play">
            <i class="ph-fill ph-play"></i>
          </div>
        </div>

        <div class="vn-project-actions">
          <button class="vn-action-btn" @click.stop="goSetup(p.id)">
            <i class="ph ph-gear-six"></i>设置
          </button>
          <button class="vn-action-btn" @click.stop="goResources(p.id)">
            <i class="ph ph-images"></i>资源
          </button>
          <button class="vn-action-btn" @click.stop="goPrepare(p.id)">
            <i class="ph ph-download-simple"></i>预生成
          </button>
          <div class="vn-action-spacer"></div>
          <button class="vn-action-btn del" @click.stop="removeProject(p.id)">
            <i class="ph ph-trash"></i>
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useVNStore } from '../../../../stores/vn'
import { useStorage } from '../../../../composables/useStorage'
import { showConfirm } from '../../../../composables/useConfirm'

const router = useRouter()
const vnStore = useVNStore()
const { scheduleSave } = useStorage()

const projects = computed(() => {
  const list = vnStore.projects || []
  return Array.isArray(list) ? [...list].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)) : []
})

function goSetup(projectId) {
  router.push(`/vn/setup/${projectId}`)
}

function goResources(projectId) {
  router.push(`/vn/resources/${projectId}`)
}

function goPrepare(projectId) {
  vnStore.setCurrentProject(projectId)
  router.push(`/vn/prepare/${projectId}`)
}

function goPlay(projectId) {
  vnStore.setCurrentProject(projectId)
  router.push(`/vn/play/${projectId}`)
}

async function removeProject(projectId) {
  const ok = await showConfirm({
    title: '删除剧本',
    message: '删除后该剧本及其进度将无法恢复，确定删除？',
    confirmText: '删除',
    destructive: true
  })
  if (!ok) return
  vnStore.deleteProject(projectId)
  scheduleSave()
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const diff = Date.now() - d
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  if (diff < 2592000000) return `${Math.floor(diff / 86400000)} 天前`
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}
</script>

<style scoped>
.vn-tab {
  position: absolute;
  inset: 0;
  overflow-y: auto;
  padding: 16px 20px calc(32px + env(safe-area-inset-bottom, 0px));
}

.vn-tab::-webkit-scrollbar { display: none; }

/* Section title */
.vn-section-title {
  padding: 20px 4px 12px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 3px;
  color: rgba(255, 255, 255, 0.32);
}

/* Empty state */
.tab-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 48px 40px;
  text-align: center;
}

.tab-empty-icon {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30px;
  color: rgba(129, 140, 248, 0.55);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  margin-bottom: 6px;
}

.tab-empty-text {
  font-family: 'Noto Serif SC', serif;
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: 5px;
  margin-left: 5px;
  color: rgba(255, 255, 255, 0.75);
}

.tab-empty-hint {
  font-size: 12px;
  letter-spacing: 1px;
  color: rgba(255, 255, 255, 0.32);
  max-width: 220px;
}

/* Project cards */
.vn-project-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.vn-project-card {
  border-radius: 24px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
}

.vn-project-main {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 16px 12px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.vn-project-main:active {
  background: rgba(255, 255, 255, 0.05);
}

.vn-project-thumb {
  width: 52px;
  height: 52px;
  border-radius: 18px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  color: #a5b4fc;
  background: linear-gradient(135deg, rgba(129, 140, 248, 0.2), rgba(168, 85, 247, 0.16));
  border: 1px solid rgba(129, 140, 248, 0.2);
}

.vn-project-info {
  flex: 1;
  min-width: 0;
}

.vn-project-name {
  font-size: 15.5px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.92);
  letter-spacing: 0.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vn-project-desc {
  margin-top: 3px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.38);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vn-project-meta {
  display: flex;
  gap: 12px;
  margin-top: 6px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.32);
}

.vn-project-meta span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.vn-project-play {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  color: #fff;
  background: linear-gradient(135deg, rgba(129, 140, 248, 0.9), rgba(99, 102, 241, 0.9));
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.35);
  transition: transform 0.2s ease;
}

.vn-project-main:active .vn-project-play {
  transform: scale(0.9);
}

.vn-project-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px 14px;
}

.vn-action-btn {
  height: 32px;
  padding: 0 12px;
  border-radius: 16px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.65);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease;
}

.vn-action-btn:active {
  transform: scale(0.94);
  background: rgba(255, 255, 255, 0.12);
}

.vn-action-btn.del {
  color: rgba(248, 113, 113, 0.8);
  border-color: rgba(248, 113, 113, 0.22);
  background: rgba(248, 113, 113, 0.08);
}

.vn-action-spacer { flex: 1; }
</style>
