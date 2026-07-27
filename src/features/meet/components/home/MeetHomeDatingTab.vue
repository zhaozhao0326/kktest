<template>
  <div class="dating-tab">
    <!-- Empty state -->
    <div v-if="soloContacts.length === 0" class="tab-empty">
      <div class="tab-empty-icon">
        <i class="ph ph-heart"></i>
      </div>
      <p class="tab-empty-text">尚无角色</p>
      <p class="tab-empty-hint">先在聊天中创建角色，再来开启一段见面</p>
    </div>

    <!-- Contact list -->
    <div v-else class="contact-list">
      <button
        v-for="c in soloContacts"
        :key="c.id"
        class="contact-card"
        @click="onContactClick(c)"
      >
        <div class="contact-avatar">
          <img v-if="c.avatarType === 'image' && c.avatar" :src="c.avatar" class="avatar-img" />
          <span v-else class="avatar-placeholder">{{ (c.name || '?')[0] }}</span>
        </div>
        <div class="contact-info">
          <div class="contact-name">{{ c.name }}</div>
          <div class="contact-meta">
            <template v-if="getMeetingCount(c.id) > 0">{{ getMeetingCount(c.id) }} 段见面</template>
            <template v-else>新的相遇</template>
          </div>
        </div>
        <i class="ph-bold ph-caret-right contact-arrow"></i>
      </button>
    </div>

    <!-- Continue / New meeting sheet -->
    <Teleport to="body">
      <Transition name="hub-sheet">
        <div v-if="showSheet" class="sheet-backdrop" @click="showSheet = false">
          <div class="sheet-panel" @click.stop>
            <div class="sheet-handle"></div>
            <div class="sheet-header">
              <div class="sheet-avatar">
                <img v-if="selectedContact?.avatarType === 'image' && selectedContact?.avatar" :src="selectedContact.avatar" class="avatar-img" />
                <span v-else class="avatar-placeholder">{{ (selectedContact?.name || '?')[0] }}</span>
              </div>
              <div class="sheet-name">{{ selectedContact?.name }}</div>
            </div>

            <div v-if="contactMeetings.length > 0" class="sheet-section">
              <div class="sheet-label">已有见面</div>
              <div
                v-for="m in contactMeetings"
                :key="m.id"
                class="sheet-meeting"
              >
                <div class="sheet-meeting-info">
                  <div class="sheet-meeting-name">{{ m.name }}</div>
                  <div class="sheet-meeting-meta">
                    <span v-if="m.location">{{ m.location }}</span>
                    <span>{{ formatTime(m.updatedAt) }}</span>
                  </div>
                </div>
                <div class="sheet-meeting-actions">
                  <button class="sheet-btn play" @click="goPlay(m.id)">
                    <i class="ph-fill ph-play"></i>
                  </button>
                  <button class="sheet-btn" @click="goSetup(m.id)">
                    <i class="ph ph-gear-six"></i>
                  </button>
                  <button class="sheet-btn del" @click="removeMeeting(m.id)">
                    <i class="ph ph-trash"></i>
                  </button>
                </div>
              </div>
            </div>

            <button class="sheet-new-btn" @click="createForContact">
              <i class="ph-bold ph-plus"></i>
              <span>新的见面</span>
            </button>
            <button class="sheet-cancel" @click="showSheet = false">取消</button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMeetStore } from '../../../../stores/meet'
import { useContactsStore } from '../../../../stores/contacts'
import { useStorage } from '../../../../composables/useStorage'
import { showConfirm } from '../../../../composables/useConfirm'

const router = useRouter()
const meetStore = useMeetStore()
const contactsStore = useContactsStore()
const { scheduleSave } = useStorage()

const showSheet = ref(false)
const selectedContact = ref(null)

const soloContacts = computed(() =>
  (contactsStore.contacts || []).filter(c => !c.isGroup)
)

const contactMeetings = computed(() => {
  if (!selectedContact.value) return []
  const cid = selectedContact.value.id
  return (meetStore.meetings || [])
    .filter(m => m.contactId === cid || (m.characters || []).some(ch => ch.contactId === cid))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
})

function getMeetingCount(contactId) {
  return (meetStore.meetings || []).filter(
    m => m.contactId === contactId || (m.characters || []).some(ch => ch.contactId === contactId)
  ).length
}

function onContactClick(contact) {
  selectedContact.value = contact
  const meetings = (meetStore.meetings || []).filter(
    m => m.contactId === contact.id || (m.characters || []).some(ch => ch.contactId === contact.id)
  )
  if (meetings.length === 0) {
    createForContact()
  } else {
    showSheet.value = true
  }
}

function createForContact() {
  const c = selectedContact.value
  if (!c) return
  const meeting = meetStore.createMeeting({
    name: `与${c.name}的见面`,
    contactId: c.id,
    characters: [{
      contactId: c.id,
      vnName: c.name,
      vnDescription: '',
      role: 'lead',
      nameColor: '#fff'
    }]
  })
  scheduleSave()
  showSheet.value = false
  router.push(`/meet/setup/${meeting.id}`)
}

function goPlay(id) {
  meetStore.setCurrentMeeting(id)
  showSheet.value = false
  router.push(`/meet/play/${id}`)
}

function goSetup(id) {
  showSheet.value = false
  router.push(`/meet/setup/${id}`)
}

async function removeMeeting(id) {
  const ok = await showConfirm({
    title: '删除见面',
    message: '删除后该见面的剧情进度将无法恢复，确定删除？',
    confirmText: '删除',
    destructive: true
  })
  if (!ok) return
  meetStore.deleteMeeting(id)
  scheduleSave()
  if (contactMeetings.value.length === 0) showSheet.value = false
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const diff = Date.now() - d
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}
</script>

<style scoped>
.dating-tab {
  position: absolute;
  inset: 0;
  overflow-y: auto;
  padding: 16px 20px calc(32px + env(safe-area-inset-bottom, 0px));
}

.dating-tab::-webkit-scrollbar { display: none; }

/* Empty state */
.tab-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 88px 40px;
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
  color: rgba(244, 114, 182, 0.55);
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
}

/* Contact list */
.contact-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.contact-card {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 14px 16px;
  border-radius: 24px;
  text-align: left;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  cursor: pointer;
  transition: transform 0.2s ease, background 0.2s ease;
}

.contact-card:active {
  transform: scale(0.98);
  background: rgba(255, 255, 255, 0.1);
}

.contact-avatar,
.sheet-avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.25);
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  font-size: 1.1rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.55);
}

.contact-info {
  flex: 1;
  min-width: 0;
}

.contact-name {
  font-size: 15.5px;
  font-weight: 600;
  letter-spacing: 1px;
  color: rgba(255, 255, 255, 0.92);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.contact-meta {
  margin-top: 4px;
  font-size: 12px;
  letter-spacing: 0.5px;
  color: rgba(244, 114, 182, 0.65);
}

.contact-arrow {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.22);
  flex-shrink: 0;
}

/* Bottom sheet */
.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet-panel {
  width: 100%;
  max-width: 520px;
  max-height: 80vh;
  overflow-y: auto;
  border-radius: 28px 28px 0 0;
  background: rgba(24, 22, 34, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-bottom: none;
  backdrop-filter: blur(32px) saturate(160%);
  -webkit-backdrop-filter: blur(32px) saturate(160%);
  padding: 10px 22px calc(28px + env(safe-area-inset-bottom, 0px));
  color: rgba(255, 255, 255, 0.92);
}

.sheet-panel::-webkit-scrollbar { display: none; }

.sheet-handle {
  width: 40px;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.2);
  margin: 0 auto 14px;
}

.sheet-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.sheet-name {
  font-family: 'Noto Serif SC', serif;
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: 3px;
  color: #fff;
}

.sheet-section {
  padding: 16px 0 4px;
}

.sheet-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 3px;
  color: rgba(255, 255, 255, 0.32);
  margin-bottom: 10px;
}

.sheet-meeting {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 13px 14px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 10px;
}

.sheet-meeting-info { min-width: 0; flex: 1; }

.sheet-meeting-name {
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.5px;
}

.sheet-meeting-meta {
  display: flex;
  gap: 10px;
  margin-top: 4px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.32);
  letter-spacing: 0.5px;
}

.sheet-meeting-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.sheet-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.07);
  color: rgba(255, 255, 255, 0.75);
  transition: transform 0.2s ease, background 0.2s ease;
}

.sheet-btn:active { transform: scale(0.88); background: rgba(255, 255, 255, 0.14); }

.sheet-btn.play {
  background: linear-gradient(135deg, rgba(244, 114, 182, 0.9), rgba(219, 39, 119, 0.9));
  border-color: rgba(244, 114, 182, 0.4);
  color: #fff;
  box-shadow: 0 3px 12px rgba(219, 39, 119, 0.3);
}

.sheet-btn.del { color: rgba(248, 113, 113, 0.8); border-color: rgba(248, 113, 113, 0.25); }

.sheet-new-btn {
  width: 100%;
  padding: 14px;
  margin-top: 12px;
  border-radius: 20px;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: linear-gradient(135deg, rgba(244, 114, 182, 0.92), rgba(219, 39, 119, 0.92));
  color: #fff;
  font-size: 14.5px;
  font-weight: 700;
  letter-spacing: 3px;
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(219, 39, 119, 0.3);
  transition: transform 0.2s ease;
}

.sheet-new-btn:active { transform: scale(0.97); }

.sheet-cancel {
  width: 100%;
  padding: 13px;
  margin-top: 8px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.55);
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: 3px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.sheet-cancel:active { background: rgba(255, 255, 255, 0.1); }

/* Sheet transition */
.hub-sheet-enter-active { transition: opacity 0.3s ease; }
.hub-sheet-leave-active { transition: opacity 0.2s ease; }
.hub-sheet-enter-from, .hub-sheet-leave-to { opacity: 0; }
.hub-sheet-enter-active .sheet-panel { transition: transform 0.45s cubic-bezier(0.16, 1, 0.3, 1); }
.hub-sheet-leave-active .sheet-panel { transition: transform 0.25s ease-in; }
.hub-sheet-enter-from .sheet-panel { transform: translateY(100%); }
.hub-sheet-leave-to .sheet-panel { transform: translateY(30%); }
</style>
