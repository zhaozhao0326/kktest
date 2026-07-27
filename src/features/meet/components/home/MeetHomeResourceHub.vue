<template>
  <section class="resource-hub" aria-label="通用创作资源">
    <div class="resource-heading">
      <div>
        <div class="resource-kicker"><i class="ph-fill ph-sparkle"></i>创作前准备</div>
        <div class="resource-title">通用创作资源</div>
      </div>
      <div class="resource-shared">约会 · 视觉小说共用</div>
    </div>

    <div class="resource-actions">
      <button class="resource-action" @click="router.push('/vn/image-config')">
        <span class="resource-icon indigo"><i class="ph ph-palette"></i></span>
        <span class="resource-action-body">
          <span class="resource-action-title">画笔与生图 API</span>
          <span class="resource-action-sub">{{ imageConfigSummary }}</span>
        </span>
        <span class="resource-status" :class="{ ready: imageConfigReady }">
          {{ imageConfigReady ? '已配置' : '先配置' }}
        </span>
      </button>

      <button class="resource-action" @click="showCharacterPicker = true">
        <span class="resource-icon rose"><i class="ph ph-user-rectangle"></i></span>
        <span class="resource-action-body">
          <span class="resource-action-title">角色立绘工房</span>
          <span class="resource-action-sub">{{ spriteSummary }}</span>
        </span>
        <span class="resource-status" :class="{ ready: preparedCharacterCount > 0 }">
          {{ preparedCharacterCount > 0 ? preparedCharacterCount + ' 角色' : '去准备' }}
        </span>
      </button>
    </div>

    <Teleport to="body">
      <Transition name="resource-sheet">
        <div v-if="showCharacterPicker" class="resource-sheet-backdrop" @click="showCharacterPicker = false">
          <div class="resource-sheet-panel" @click.stop>
            <div class="resource-sheet-handle"></div>
            <div class="resource-sheet-title-row">
              <div>
                <div class="resource-sheet-title">选择角色</div>
                <div class="resource-sheet-subtitle">立绘会同时用于约会与视觉小说</div>
              </div>
              <button class="resource-sheet-close" aria-label="关闭" @click="showCharacterPicker = false">
                <i class="ph ph-x"></i>
              </button>
            </div>
            <div class="resource-sheet-list">
              <button
                v-for="contact in contacts"
                :key="contact.id"
                class="resource-sheet-contact"
                @click="goStudio(contact.id)"
              >
                <span class="resource-sheet-avatar">
                  <img
                    v-if="contact.avatarType === 'image' && contact.avatar"
                    :src="contact.avatar"
                    class="resource-avatar-image"
                    alt=""
                  >
                  <span v-else-if="contact.avatarType === 'emoji' && contact.avatar">{{ contact.avatar }}</span>
                  <span v-else class="resource-avatar-placeholder">{{ (contact.name || '?')[0] }}</span>
                </span>
                <span class="resource-sheet-contact-body">
                  <span class="resource-sheet-contact-name">{{ contact.name }}</span>
                  <span class="resource-sheet-contact-meta">
                    {{ hasCharacterAssets(contact.id) ? '已有立绘素材' : '尚未准备立绘' }}
                  </span>
                </span>
                <i class="ph-bold ph-caret-right resource-sheet-contact-arrow"></i>
              </button>
              <div v-if="contacts.length === 0" class="resource-sheet-empty">
                暂无角色，请先在聊天中创建联系人
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCharacterResourcesStore } from '../../../../stores/characterResources'
import { useContactsStore } from '../../../../stores/contacts'
import { useVNStore } from '../../../../stores/vn'

const router = useRouter()
const contactsStore = useContactsStore()
const characterResourcesStore = useCharacterResourcesStore()
const vnStore = useVNStore()

const showCharacterPicker = ref(false)
const contacts = computed(() => (contactsStore.contacts || []).filter(contact => !contact.isGroup))

function hasCharacterAssets(contactId) {
  const entry = characterResourcesStore.resources?.[contactId]
  if (entry?.baseImage?.url) return true
  return Object.values(entry?.expressions || {}).some(resource => !!resource?.url)
}

const preparedCharacterCount = computed(() =>
  contacts.value.filter(contact => hasCharacterAssets(contact.id)).length
)

const spriteSummary = computed(() => preparedCharacterCount.value > 0
  ? '管理已生成的通用角色素材'
  : '建议先生成角色基础立绘'
)

const providerLabels = {
  openai_images: 'GPT Image',
  nanobanana: 'Gemini',
  novelai: 'NovelAI',
  custom: '自定义接口'
}

const imageProviderLabel = computed(() =>
  providerLabels[vnStore.imageGenConfig?.provider] || '生图接口'
)

const imageConfigReady = computed(() => {
  const config = vnStore.imageGenConfig || {}
  switch (config.provider) {
    case 'openai_images':
      return !!config.openaiImages?.apiKey || (
        config.openaiImages?.apiKeyMode === 'none' && !!config.openaiImages?.endpoint
      )
    case 'nanobanana':
      return !!config.nanobanana?.apiKey || (
        config.nanobanana?.apiKeyMode === 'none' && !!config.nanobanana?.endpoint
      )
    case 'novelai': return !!config.novelai?.apiKey
    case 'custom': return !!config.custom?.endpoint
    default: return false
  }
})

const imageConfigSummary = computed(() => imageConfigReady.value
  ? imageProviderLabel.value + ' · 可用于两种模式'
  : '配置模型、接口与生成策略'
)

function goStudio(contactId) {
  showCharacterPicker.value = false
  router.push('/vn/studio/' + contactId)
}
</script>

<style scoped>
.resource-hub {
  position: relative;
  z-index: 2;
  flex-shrink: 0;
  margin: 8px 20px 0;
  padding: 14px;
  overflow: hidden;
  border: 1px solid rgba(129, 140, 248, 0.24);
  border-radius: 24px;
  background: radial-gradient(circle at 8% 0%, rgba(129, 140, 248, 0.18), transparent 42%), rgba(255, 255, 255, 0.065);
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.16);
  backdrop-filter: blur(24px) saturate(150%);
  -webkit-backdrop-filter: blur(24px) saturate(150%);
}

.resource-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; padding: 0 2px 11px; }
.resource-kicker { display: flex; align-items: center; gap: 5px; margin-bottom: 3px; color: #a5b4fc; font-size: 9px; font-weight: 700; letter-spacing: 0.18em; }
.resource-title { color: rgba(255, 255, 255, 0.94); font-family: 'Noto Serif SC', 'SimSun', serif; font-size: 15px; font-weight: 700; letter-spacing: 0.08em; }
.resource-shared { padding: 4px 8px; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 999px; background: rgba(255, 255, 255, 0.06); color: rgba(255, 255, 255, 0.42); font-size: 9px; white-space: nowrap; }
.resource-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }

.resource-action {
  position: relative;
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 9px;
  padding: 11px 10px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 17px;
  background: rgba(10, 9, 18, 0.24);
  color: #fff;
  text-align: left;
  cursor: pointer;
  transition: transform 0.2s ease, background 0.2s ease, border-color 0.2s ease;
}

.resource-action:active { transform: scale(0.97); border-color: rgba(165, 180, 252, 0.3); background: rgba(255, 255, 255, 0.1); }
.resource-icon { flex-shrink: 0; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 13px; font-size: 18px; }
.resource-icon.indigo { background: rgba(129, 140, 248, 0.16); color: #a5b4fc; }
.resource-icon.rose { background: rgba(244, 114, 182, 0.14); color: #f9a8d4; }
.resource-action-body { min-width: 0; display: flex; flex: 1; flex-direction: column; gap: 2px; }
.resource-action-title, .resource-action-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.resource-action-title { color: rgba(255, 255, 255, 0.9); font-size: 12px; font-weight: 700; line-height: 1.35; }
.resource-action-sub { color: rgba(255, 255, 255, 0.34); font-size: 9.5px; line-height: 1.35; }
.resource-status { position: absolute; top: 6px; right: 7px; padding: 2px 5px; border-radius: 999px; background: rgba(251, 191, 36, 0.12); color: rgba(253, 230, 138, 0.82); font-size: 8px; }
.resource-status.ready { background: rgba(52, 211, 153, 0.12); color: rgba(167, 243, 208, 0.82); }

.resource-sheet-backdrop { position: fixed; inset: 0; z-index: 90; display: flex; align-items: flex-end; justify-content: center; background: rgba(0, 0, 0, 0.58); backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px); }
.resource-sheet-panel { width: 100%; max-width: 520px; max-height: 72vh; display: flex; flex-direction: column; overflow: hidden; padding: 10px 22px 0; border: 1px solid rgba(255, 255, 255, 0.1); border-bottom: 0; border-radius: 28px 28px 0 0; background: rgba(24, 22, 34, 0.94); color: rgba(255, 255, 255, 0.92); backdrop-filter: blur(32px) saturate(160%); -webkit-backdrop-filter: blur(32px) saturate(160%); }
.resource-sheet-handle { flex-shrink: 0; width: 40px; height: 4px; margin: 0 auto 12px; border-radius: 2px; background: rgba(255, 255, 255, 0.2); }
.resource-sheet-title-row { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding-bottom: 14px; }
.resource-sheet-title { color: #fff; font-family: 'Noto Serif SC', serif; font-size: 1.05rem; font-weight: 700; letter-spacing: 3px; }
.resource-sheet-subtitle { margin-top: 3px; color: rgba(255, 255, 255, 0.34); font-size: 10px; }
.resource-sheet-close { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 50%; background: rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.6); cursor: pointer; }
.resource-sheet-list { flex: 1; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; padding-bottom: calc(28px + env(safe-area-inset-bottom, 0px)); }
.resource-sheet-list::-webkit-scrollbar { display: none; }

.resource-sheet-contact { width: 100%; display: flex; align-items: center; gap: 12px; padding: 11px 14px; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 18px; background: rgba(255, 255, 255, 0.05); color: #fff; text-align: left; cursor: pointer; }
.resource-sheet-contact:active { background: rgba(255, 255, 255, 0.1); }
.resource-sheet-avatar { flex-shrink: 0; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; overflow: hidden; border-radius: 50%; background: rgba(255, 255, 255, 0.08); box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.22); }
.resource-avatar-image { width: 100%; height: 100%; object-fit: cover; }
.resource-avatar-placeholder { color: rgba(255, 255, 255, 0.55); font-size: 13px; font-weight: 700; }
.resource-sheet-contact-body { min-width: 0; display: flex; flex: 1; flex-direction: column; gap: 2px; }
.resource-sheet-contact-name { overflow: hidden; color: rgba(255, 255, 255, 0.88); font-size: 14px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.resource-sheet-contact-meta { color: rgba(255, 255, 255, 0.34); font-size: 10.5px; }
.resource-sheet-contact-arrow { color: rgba(255, 255, 255, 0.22); font-size: 12px; }
.resource-sheet-empty { padding: 32px 0; color: rgba(255, 255, 255, 0.35); font-size: 13px; text-align: center; }

.resource-sheet-enter-active { transition: opacity 0.3s ease; }
.resource-sheet-leave-active { transition: opacity 0.2s ease; }
.resource-sheet-enter-from, .resource-sheet-leave-to { opacity: 0; }
.resource-sheet-enter-active .resource-sheet-panel { transition: transform 0.45s cubic-bezier(0.16, 1, 0.3, 1); }
.resource-sheet-leave-active .resource-sheet-panel { transition: transform 0.25s ease-in; }
.resource-sheet-enter-from .resource-sheet-panel { transform: translateY(100%); }
.resource-sheet-leave-to .resource-sheet-panel { transform: translateY(30%); }

@media (max-width: 480px) {
  .resource-hub { margin-inline: 14px; }
  .resource-action { padding-inline: 8px; }
  .resource-icon { width: 34px; height: 34px; }
  .resource-status { display: none; }
}
</style>
