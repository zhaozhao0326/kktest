<template>
  <div class="absolute inset-0 z-20 bg-[var(--bg-color)] flex flex-col text-[var(--text-primary)]">
    <header class="pt-app-lg px-4 pb-3 flex items-center justify-between border-b border-[var(--border-color)] bg-[var(--bg-color)]">
      <button class="h-9 w-9 rounded-full flex items-center justify-center text-[var(--primary-color)] active:bg-black/5 dark:active:bg-white/10" @click="router.push('/')">
        <i class="ph ph-caret-left text-[22px]"></i>
      </button>
      <div class="text-center min-w-0">
        <h1 class="text-[17px] font-semibold truncate">后台日志</h1>
        <p class="text-[12px] text-[var(--text-secondary)]">{{ counts.all }} 条</p>
      </div>
      <button class="h-9 w-9 rounded-full flex items-center justify-center text-[var(--primary-color)] active:bg-black/5 dark:active:bg-white/10" @click="copyLogs">
        <i class="ph ph-copy text-[20px]"></i>
      </button>
    </header>

    <div class="px-4 py-3 border-b border-[var(--border-color)] bg-[var(--bg-color)]">
      <div class="grid grid-cols-5 gap-1 rounded-[10px] p-1 bg-black/5 dark:bg-white/10">
        <button
          v-for="option in filterOptions"
          :key="option.value"
          class="h-8 rounded-[8px] text-[12px] font-medium flex items-center justify-center gap-1 transition-colors"
          :class="activeFilter === option.value ? 'bg-[var(--card-bg)] text-[var(--primary-color)] shadow-sm' : 'text-[var(--text-secondary)]'"
          @click="activeFilter = option.value"
        >
          <span>{{ option.label }}</span>
          <span class="font-semibold">{{ option.count }}</span>
        </button>
      </div>
    </div>

    <main class="flex-1 overflow-y-auto no-scrollbar px-4 py-4 space-y-3">
      <div v-if="filteredEntries.length === 0" class="h-full flex flex-col items-center justify-center text-[var(--text-secondary)] gap-3">
        <div class="w-14 h-14 rounded-[14px] bg-[var(--card-bg)] flex items-center justify-center">
          <i class="ph ph-terminal-window text-[26px]"></i>
        </div>
        <span class="text-[14px]">暂无日志</span>
      </div>

      <article
        v-for="entry in filteredEntries"
        :key="entry.id"
        class="rounded-[10px] bg-[var(--card-bg)] border border-[var(--border-color)] overflow-hidden"
      >
        <button class="w-full p-3 text-left flex items-start gap-3" @click="toggleEntry(entry.id)">
          <span class="mt-0.5 w-8 h-8 rounded-[8px] flex items-center justify-center shrink-0" :class="levelIconClass(entry.level)">
            <i :class="levelIcon(entry.level)" class="text-[17px]"></i>
          </span>
          <span class="min-w-0 flex-1">
            <span class="flex items-center gap-2 min-w-0">
              <span class="text-[13px] font-semibold uppercase shrink-0" :class="levelTextClass(entry.level)">{{ entry.level }}</span>
              <span class="text-[12px] text-[var(--text-secondary)] truncate">{{ entry.scope }}</span>
              <span class="text-[12px] text-[var(--text-secondary)] ml-auto shrink-0">{{ formatTime(entry.ts) }}</span>
            </span>
            <span class="block mt-1 text-[14px] leading-5 break-words">{{ entry.message }}</span>
          </span>
        </button>
        <pre v-if="expandedIds.has(entry.id) && entry.details" class="mx-3 mb-3 max-h-52 overflow-auto rounded-[8px] bg-black/5 dark:bg-white/5 p-3 text-[12px] leading-5 whitespace-pre-wrap break-words text-[var(--text-secondary)]">{{ entry.details }}</pre>
      </article>
    </main>

    <footer class="px-4 py-3 pb-app border-t border-[var(--border-color)] bg-[var(--bg-color)]">
      <button class="w-full h-11 rounded-[10px] bg-red-500/10 text-red-500 text-[15px] font-semibold flex items-center justify-center gap-2" @click="clearLogs">
        <i class="ph ph-trash text-[18px]"></i>
        清空日志
      </button>
    </footer>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDebugLog } from '../composables/useDebugLog'
import { useToast } from '../composables/useToast'

const router = useRouter()
const { entries, counts, clearDebugLogs, formatDebugLogsForCopy } = useDebugLog()
const { showToast } = useToast()
const activeFilter = ref('all')
const expandedIds = ref(new Set())

const filterOptions = computed(() => [
  { value: 'all', label: '全部', count: counts.value.all },
  { value: 'error', label: '错误', count: counts.value.error },
  { value: 'warn', label: '警告', count: counts.value.warn },
  { value: 'info', label: '信息', count: counts.value.info },
  { value: 'debug', label: '调试', count: counts.value.debug }
])

const filteredEntries = computed(() => {
  const list = entries.value.slice().reverse()
  if (activeFilter.value === 'all') return list
  return list.filter(item => item?.level === activeFilter.value)
})

function formatTime(ts) {
  try {
    return new Date(ts || Date.now()).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
  } catch {
    return ''
  }
}

function levelIcon(level) {
  if (level === 'error') return 'ph-fill ph-warning-octagon'
  if (level === 'warn') return 'ph-fill ph-warning'
  if (level === 'debug') return 'ph-fill ph-bug'
  return 'ph-fill ph-info'
}

function levelIconClass(level) {
  if (level === 'error') return 'bg-red-500/10 text-red-500'
  if (level === 'warn') return 'bg-amber-500/10 text-amber-500'
  if (level === 'debug') return 'bg-violet-500/10 text-violet-500'
  return 'bg-blue-500/10 text-[var(--primary-color)]'
}

function levelTextClass(level) {
  if (level === 'error') return 'text-red-500'
  if (level === 'warn') return 'text-amber-500'
  if (level === 'debug') return 'text-violet-500'
  return 'text-[var(--primary-color)]'
}

function toggleEntry(id) {
  const next = new Set(expandedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedIds.value = next
}

async function copyLogs() {
  const text = formatDebugLogsForCopy(filteredEntries.value)
  if (!text) {
    showToast('没有可复制的日志')
    return
  }
  try {
    await navigator.clipboard.writeText(text)
    showToast('日志已复制')
  } catch {
    showToast('复制失败')
  }
}

function clearLogs() {
  clearDebugLogs()
  expandedIds.value = new Set()
  showToast('日志已清空')
}
</script>
