<template>
  <Teleport to="body">
    <Transition name="edit-modal-fade">
      <div
        v-if="visible"
        class="edit-modal-shell fixed z-[950] flex items-center justify-center overflow-y-auto no-scrollbar"
        @keydown.esc.stop="onEsc"
      >
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="$emit('cancel')"></div>
        <div class="edit-modal-card relative z-10 w-full max-w-[340px] rounded-2xl bg-[var(--card-bg)] shadow-2xl overflow-hidden">
          <div class="px-4 pt-4 pb-2 text-center">
            <div class="text-[16px] font-semibold text-[var(--text-primary)]">编辑消息</div>
          </div>
          <div class="px-4 pb-4">
            <textarea
              ref="textareaEl"
              v-model="draft"
              rows="1"
              class="edit-modal-textarea w-full text-[15px] leading-[1.5] text-[var(--text-primary)] bg-[var(--bg-color)] rounded-xl px-3 py-2.5 outline-none resize-none border border-[var(--border-color)] focus:border-[var(--primary-color)] transition-colors"
              @input="syncHeight"
              @keydown="onKeydown"
            ></textarea>
          </div>
          <div class="flex border-t border-[var(--border-color)]">
            <button class="flex-1 py-3 text-[16px] text-[var(--text-secondary)] active:bg-black/5 dark:active:bg-white/10 transition-colors" @click="$emit('cancel')">取消</button>
            <div class="w-[1px] self-stretch bg-[var(--border-color)]"></div>
            <button
              class="flex-1 py-3 text-[16px] font-semibold text-[var(--primary-color)] disabled:opacity-40 active:bg-black/5 dark:active:bg-white/10 transition-colors"
              :disabled="!canSave"
              @click="save"
            >保存</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  text: { type: String, default: '' }
})

const emit = defineEmits(['cancel', 'save'])

const draft = ref('')
const textareaEl = ref(null)

const canSave = computed(() => !!draft.value.trim())

function viewportHeight() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--app-vh')
  const parsed = parseFloat(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : window.innerHeight
}

function syncHeight() {
  const el = textareaEl.value
  if (!el) return
  el.style.height = 'auto'
  const max = Math.floor(viewportHeight() * 0.4)
  el.style.height = `${Math.min(el.scrollHeight, max)}px`
}

function save() {
  if (!canSave.value) return
  emit('save', draft.value)
}

function onEsc(event) {
  // IME 组合中按 Esc 是在关闭候选词，不应关闭弹窗
  if (event.isComposing) return
  emit('cancel')
}

function onKeydown(event) {
  if (event.isComposing) return
  // Enter 换行；Ctrl/Cmd + Enter 保存
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    save()
  }
}

watch(() => props.visible, (v) => {
  if (!v) return
  draft.value = props.text || ''
  nextTick(() => {
    syncHeight()
    try {
      textareaEl.value?.focus({ preventScroll: true })
      const len = draft.value.length
      textareaEl.value?.setSelectionRange(len, len)
    } catch { /* focus 失败可忽略 */ }
  })
}, { immediate: true })
</script>

<style scoped>
.edit-modal-fade-enter-active,
.edit-modal-fade-leave-active { transition: opacity 0.22s ease; }
.edit-modal-fade-enter-from,
.edit-modal-fade-leave-to { opacity: 0; }
.edit-modal-fade-enter-active .edit-modal-card,
.edit-modal-fade-leave-active .edit-modal-card { transition: transform 0.22s cubic-bezier(0.34, 1.3, 0.64, 1); }
.edit-modal-fade-enter-from .edit-modal-card,
.edit-modal-fade-leave-to .edit-modal-card { transform: scale(0.94); }

.edit-modal-shell {
  inset: auto 0;
  top: var(--app-vv-top, 0px);
  height: var(--app-vh, 100dvh);
  padding: 24px;
  overscroll-behavior: contain;
}

.edit-modal-textarea {
  min-height: 44px;
  max-height: calc(var(--app-vh, 100vh) * 0.4);
  overflow-y: auto;
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.edit-modal-textarea::-webkit-scrollbar {
  display: none;
}
</style>
