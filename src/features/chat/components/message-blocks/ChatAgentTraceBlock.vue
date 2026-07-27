<template>
  <div
    class="agent-trace-row"
    :class="{ 'agent-trace-row-offset': showChatAvatars || block.isGroupChat }"
    :data-msg-id="block.msgId"
    data-msg-part="agent-trace"
  >
    <div class="agent-trace-card" :class="{ 'agent-trace-card-expanded': expanded }">
      <button
        type="button"
        class="agent-trace-trigger"
        :class="[
          block.type === 'reasoning' ? 'agent-trace-trigger-reasoning' : 'agent-trace-trigger-tool',
          block.type === 'toolLog' && !block.success ? 'agent-trace-trigger-error' : ''
        ]"
        :aria-expanded="expanded"
        :aria-controls="detailsId"
        @click="expanded = !expanded"
      >
        <span class="agent-trace-icon" aria-hidden="true">
          <i :class="iconClass"></i>
        </span>
        <span class="agent-trace-label">
          {{ collapsedLabel }}
        </span>
        <span v-if="block.type === 'reasoning' && block.streaming" class="agent-trace-live-dot" aria-label="正在思考"></span>
        <i
          v-if="block.type === 'toolLog' && !block.success"
          class="ph ph-warning-circle agent-trace-status-icon agent-trace-status-error"
          aria-hidden="true"
        ></i>
        <i class="ph ph-caret-right agent-trace-chevron" :class="{ 'agent-trace-chevron-open': expanded }" aria-hidden="true"></i>
      </button>

      <Transition name="agent-trace-expand">
        <div v-if="expanded" :id="detailsId" class="agent-trace-details">
          <template v-if="block.type === 'reasoning'">
            <div class="agent-trace-detail-heading">
              <div class="agent-trace-detail-title">
                <i class="ph ph-brain"></i>
                <span>思考过程</span>
              </div>
              <span class="agent-trace-round">第 {{ block.round }} 轮</span>
            </div>
            <div class="agent-trace-reasoning-text">{{ block.content }}</div>
          </template>

          <template v-else>
            <div class="agent-trace-detail-heading">
              <div class="agent-trace-detail-title min-w-0">
                <i :class="iconClass"></i>
                <span class="truncate">{{ block.title }}</span>
              </div>
              <span class="agent-trace-result-badge" :class="block.success ? 'agent-trace-result-success' : 'agent-trace-result-error'">
                {{ block.success ? '已完成' : '失败' }}
              </span>
            </div>
            <div class="agent-trace-meta">
              <span>{{ block.sourceLabel }}</span>
              <span>第 {{ block.round }} 轮</span>
              <span v-if="block.durationLabel">{{ block.durationLabel }}</span>
            </div>
            <div v-if="block.subtitle" class="agent-trace-subtitle">{{ block.subtitle }}</div>
            <div v-if="block.summary" class="agent-trace-summary">{{ block.summary }}</div>
            <div v-if="block.argsPreview" class="agent-trace-section">
              <div class="agent-trace-section-label">参数</div>
              <pre class="agent-trace-code">{{ block.argsPreview }}</pre>
            </div>
            <div v-if="block.resultPreview" class="agent-trace-section">
              <div class="agent-trace-section-label">结果</div>
              <pre class="agent-trace-code">{{ block.resultPreview }}</pre>
            </div>
            <div v-else-if="block.errorText" class="agent-trace-error-text">{{ block.errorText }}</div>
          </template>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  block: { type: Object, required: true },
  showChatAvatars: { type: Boolean, default: false }
})

const expanded = ref(false)

const detailsId = computed(() => `agent-trace-${String(props.block.key || props.block.msgId || 'item').replace(/[^a-zA-Z0-9_-]/g, '-')}`)

const collapsedLabel = computed(() => {
  if (props.block.type === 'reasoning') {
    return props.block.summary || '已完成思考'
  }
  return props.block.title || '工具调用'
})

const iconClass = computed(() => {
  if (props.block.type === 'reasoning') return 'ph ph-clock'

  const name = `${props.block.title || ''} ${props.block.subtitle || ''}`.toLowerCase()
  if (name.includes('web') || name.includes('browser') || name.includes('网页')) return 'ph ph-globe-hemisphere-west'
  if (name.includes('search') || name.includes('搜索')) return 'ph ph-magnifying-glass'
  if (name.includes('calendar') || name.includes('event') || name.includes('日程')) return 'ph ph-calendar-dots'
  if (name.includes('file') || name.includes('read') || name.includes('文件')) return 'ph ph-file-text'
  if (name.includes('image') || name.includes('图片')) return 'ph ph-image'
  if (name.includes('notion') || name.includes('page')) return 'ph ph-note-pencil'
  return 'ph ph-wrench'
})
</script>

<style scoped>
.agent-trace-row {
  display: flex;
  justify-content: flex-start;
  width: 100%;
  margin: 2px 0 5px;
}

.agent-trace-row-offset {
  padding-left: 40px;
}

.agent-trace-card {
  max-width: min(84%, 520px);
  min-width: 0;
}

.agent-trace-card-expanded {
  width: min(88%, 520px);
}

.agent-trace-trigger {
  display: flex;
  align-items: center;
  width: fit-content;
  max-width: 100%;
  min-height: 34px;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid color-mix(in srgb, var(--border-color, #d8d8d8) 46%, transparent 54%);
  border-radius: 999px;
  color: color-mix(in srgb, var(--text-secondary, #8e8e93) 88%, transparent 12%);
  background: color-mix(in srgb, var(--card-bg, #fff) 22%, transparent 78%);
  backdrop-filter: blur(12px) saturate(130%);
  -webkit-backdrop-filter: blur(12px) saturate(130%);
  font: inherit;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
  transition: transform 120ms ease, background-color 160ms ease, border-color 160ms ease;
}

.agent-trace-trigger:active {
  transform: scale(0.985);
}

.agent-trace-trigger-reasoning {
  min-height: 30px;
  padding: 4px 2px;
  border-color: transparent;
  border-radius: 0;
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.agent-trace-trigger-error {
  border-color: color-mix(in srgb, #ef4444 34%, var(--border-color, #d8d8d8) 66%);
}

.agent-trace-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  font-size: 16px;
  color: color-mix(in srgb, var(--text-secondary, #8e8e93) 82%, transparent 18%);
}

.agent-trace-trigger-tool .agent-trace-icon {
  color: color-mix(in srgb, var(--text-secondary, #8e8e93) 82%, transparent 18%);
}

.agent-trace-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  line-height: 20px;
  font-weight: 450;
  letter-spacing: 0.005em;
}

.agent-trace-trigger-reasoning .agent-trace-label {
  font-weight: 400;
  font-size: 13px;
}

.agent-trace-status-icon {
  flex: 0 0 auto;
  font-size: 15px;
}

.agent-trace-status-error {
  color: color-mix(in srgb, #dc4c4c 74%, var(--text-secondary, #8e8e93) 26%);
}

.agent-trace-live-dot {
  width: 5px;
  height: 5px;
  flex: 0 0 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text-secondary, #8e8e93) 72%, transparent 28%);
  animation: agent-trace-pulse 1.15s ease-in-out infinite;
}

.agent-trace-chevron {
  flex: 0 0 auto;
  font-size: 14px;
  color: color-mix(in srgb, var(--text-secondary, #8e8e93) 72%, transparent 28%);
  transition: transform 180ms ease;
}

.agent-trace-chevron-open {
  transform: rotate(90deg);
}

.agent-trace-details {
  margin-top: 5px;
  padding: 13px 14px 14px;
  border: 1px solid color-mix(in srgb, var(--border-color, #d8d8d8) 48%, transparent 52%);
  border-radius: 17px;
  color: var(--text-primary, #111);
  background:
    linear-gradient(145deg, color-mix(in srgb, var(--card-bg, #fff) 72%, transparent 28%), color-mix(in srgb, var(--card-bg, #fff) 48%, transparent 52%));
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.055), inset 0 1px 0 rgba(255, 255, 255, 0.28);
  backdrop-filter: blur(22px) saturate(145%);
  -webkit-backdrop-filter: blur(22px) saturate(145%);
}

.agent-trace-detail-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.agent-trace-detail-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #111);
}

.agent-trace-detail-title i {
  color: color-mix(in srgb, var(--text-secondary, #8e8e93) 80%, transparent 20%);
  font-size: 16px;
}

.agent-trace-round,
.agent-trace-meta,
.agent-trace-subtitle {
  color: var(--text-secondary, #8e8e93);
  font-size: 11px;
}

.agent-trace-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  margin-top: 7px;
}

.agent-trace-subtitle {
  margin-top: 7px;
  line-height: 1.45;
  word-break: break-word;
}

.agent-trace-summary {
  margin-top: 9px;
  color: var(--text-primary, #111);
  font-size: 12px;
  line-height: 1.55;
  word-break: break-word;
}

.agent-trace-reasoning-text {
  max-height: 320px;
  margin-top: 10px;
  overflow: auto;
  padding-left: 11px;
  border-left: 2px solid color-mix(in srgb, var(--text-secondary, #8e8e93) 24%, transparent 76%);
  color: color-mix(in srgb, var(--text-primary, #111) 78%, var(--text-secondary, #8e8e93) 22%);
  font-size: 13px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}

.agent-trace-result-badge {
  flex: 0 0 auto;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 650;
}

.agent-trace-result-success {
  color: #087a50;
  background: rgba(34, 160, 107, 0.12);
}

.agent-trace-result-error {
  color: #b42318;
  background: rgba(220, 76, 76, 0.12);
}

.agent-trace-section {
  margin-top: 11px;
  padding-top: 10px;
  border-top: 1px solid color-mix(in srgb, var(--border-color, #d8d8d8) 74%, transparent 26%);
}

.agent-trace-section-label {
  margin-bottom: 6px;
  color: var(--text-secondary, #8e8e93);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.agent-trace-code {
  max-height: 260px;
  margin: 0;
  padding: 9px 10px;
  overflow: auto;
  border: 1px solid color-mix(in srgb, var(--border-color, #d8d8d8) 34%, transparent 66%);
  border-radius: 12px;
  color: color-mix(in srgb, var(--text-primary, #111) 88%, var(--text-secondary, #8e8e93) 12%);
  background: color-mix(in srgb, var(--bg-color, #f2f2f7) 34%, transparent 66%);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 11px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

.agent-trace-error-text {
  margin-top: 10px;
  color: #dc4c4c;
  font-size: 12px;
  line-height: 1.55;
  word-break: break-word;
}

.agent-trace-expand-enter-active,
.agent-trace-expand-leave-active {
  overflow: hidden;
  transition: opacity 160ms ease, transform 160ms ease;
}

.agent-trace-expand-enter-from,
.agent-trace-expand-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@keyframes agent-trace-pulse {
  0%, 100% {
    opacity: 0.32;
    transform: scale(0.8);
  }
  50% {
    opacity: 0.9;
    transform: scale(1.15);
  }
}
</style>
