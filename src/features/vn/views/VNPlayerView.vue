<template>
  <div class="vn-player" @click="handleTap">
    <VNBackground :bg="player.currentBg" />
    <VNSpriteLayer :sprites="player.sprites" />

    <!-- ===== Top Bar ===== -->
    <div class="vn-topbar">
      <button class="vn-glass-circle" @click.stop="goHome" aria-label="返回">
        <i class="ph ph-caret-left"></i>
      </button>

      <div class="vn-scene-pill">
        <span class="vn-scene-label">{{ sceneLabel }}</span>
        <span v-if="player.isGenerating || player.isGeneratingImage" class="vn-gen-dot"></span>
      </div>

      <VNControls
        :mode="player.isSkipping ? 'skip' : (player.isAutoPlay ? 'auto' : 'off')"
        :is-generating="player.isGenerating || player.isGeneratingImage"
        @toggle-auto="toggleAutoPlay"
        @show-history="showHistory = true"
        @menu="toggleMenu"
      />
    </div>

    <!-- ===== Mode Pill (AUTO / SKIP) ===== -->
    <Transition name="vn-mode">
      <button
        v-if="player.isAutoPlay || player.isSkipping"
        class="vn-mode-pill"
        :class="player.isSkipping ? 'skip' : 'auto'"
        @click.stop="cancelMode"
      >
        <span class="vn-mode-label">{{ player.isSkipping ? 'SKIP ▸▸' : 'AUTO ▸' }}</span>
        <i class="ph-bold ph-x"></i>
      </button>
    </Transition>

    <!-- ===== Generating Pill ===== -->
    <Transition name="vn-gen">
      <div v-if="player.isGenerating || player.isGeneratingImage" class="vn-gen-pill">
        <i class="ph ph-circle-notch vn-gen-spin"></i>
        <span>{{ player.isGeneratingImage ? '绘制画面中…' : '剧情生成中…' }}</span>
      </div>
    </Transition>

    <!-- ===== Narration (serif typewriter) ===== -->
    <VNNarration
      v-if="player.currentDialog?.isNarration"
      :text="player.currentDialog.text"
      :text-speed="player.textSpeed"
      :is-playing="player.isPlaying"
      @complete="onNarrationComplete"
      @advance="handleTap"
    />

    <!-- ===== Dialog (glassmorphism) ===== -->
    <VNDialogBox
      v-else-if="player.currentDialog"
      :name="player.currentDialog.vnName"
      :name-color="player.currentDialog.nameColor"
      :text="player.currentDialog.text"
      :text-speed="player.textSpeed"
      :is-playing="player.isPlaying"
      @complete="onDialogComplete"
    />

    <!-- ===== Choices ===== -->
    <VNChoices
      v-if="player.currentChoices"
      :options="player.currentChoices"
      @select="onChoiceSelect"
      @custom="onCustomChoice"
    />

    <!-- ===== Input Bar ===== -->
    <Transition name="vn-input">
      <div v-if="showInputBar" class="vn-input-area">
        <div class="vn-input-glass">
          <input
            v-model="userInput"
            type="text"
            class="vn-input-field"
            placeholder="输入推动剧情…（留空=继续）"
            @click.stop
            @keydown.enter="sendUserInput"
          >
          <button
            class="vn-input-send"
            :disabled="player.isGenerating"
            @click.stop="sendUserInput"
          >
            <i class="ph ph-paper-plane-tilt"></i>
          </button>
        </div>
      </div>
    </Transition>

    <!-- ===== Panels ===== -->
    <Transition name="vn-panel">
      <VNHistory v-if="showHistory" @close="showHistory = false" />
    </Transition>
    <Transition name="vn-panel">
      <VNSaveLoad
        v-if="showSave"
        @before-load="cancelActivePlayback('load')"
        @loaded="resumeLoadedGame"
        @close="showSave = false"
      />
    </Transition>
    <Transition name="vn-panel">
      <VNSettingsPanel v-if="showSettings" @close="showSettings = false" />
    </Transition>

    <!-- ===== Menu Bottom Sheet ===== -->
    <Transition name="vn-menu">
      <div v-if="showMenu" class="vn-menu-backdrop" @click.stop="showMenu = false">
        <div class="vn-menu-sheet" @click.stop>
          <div class="vn-menu-handle"></div>
          <button class="vn-menu-item" @click.stop="showSave = true; showMenu = false">
            <i class="ph ph-floppy-disk"></i>
            <span>存档 / 读档</span>
          </button>
          <button class="vn-menu-item" @click.stop="showSettings = true; showMenu = false">
            <i class="ph ph-sliders-horizontal"></i>
            <span>设置</span>
          </button>
          <button class="vn-menu-item" @click.stop="goResources">
            <i class="ph ph-images"></i>
            <span>资源管理</span>
          </button>
          <div class="vn-menu-divider"></div>
          <button class="vn-menu-item" @click.stop="restartStory">
            <i class="ph ph-arrow-counter-clockwise"></i>
            <span>重新开始</span>
          </button>
          <button class="vn-menu-item danger" @click.stop="goHome">
            <i class="ph ph-sign-out"></i>
            <span>退出</span>
          </button>
          <button class="vn-menu-cancel" @click.stop="showMenu = false">
            取消
          </button>
        </div>
      </div>
    </Transition>

    <!-- ===== Start Overlay ===== -->
    <Transition name="vn-start">
      <div v-if="showStartOverlay" class="vn-start-overlay" @click.stop>
        <div class="vn-start-card">
          <div class="vn-start-glow"></div>
          <div class="vn-start-deco">&#10022;</div>
          <div class="vn-start-title">{{ projectTitle }}</div>
          <div class="vn-start-desc">
            需要先在「项目设置」里填写世界观与角色。点击开始，AI 将生成剧情。
          </div>
          <div class="vn-start-actions">
            <button class="vn-start-btn secondary" @click.stop="goSetup">
              <i class="ph ph-gear-six"></i> 设置
            </button>
            <button
              class="vn-start-btn primary"
              :disabled="player.isGenerating"
              @click.stop="start"
            >
              <i class="ph ph-play"></i> 开始
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useVNStore } from '../../../stores/vn'
import { useStorage } from '../../../composables/useStorage'
import { useToast } from '../../../composables/useToast'
import { useVNApi } from '../composables/useVNApi'
import { useImageGen } from '../../../composables/useImageGen'
import { useTTS } from '../../../composables/useTTS'
import { useBGM } from '../../../composables/useBGM'

import VNBackground from '../components/VNBackground.vue'
import VNSpriteLayer from '../components/VNSpriteLayer.vue'
import VNDialogBox from '../components/VNDialogBox.vue'
import VNNarration from '../components/VNNarration.vue'
import VNChoices from '../components/VNChoices.vue'
import VNControls from '../components/VNControls.vue'
import VNHistory from '../components/VNHistory.vue'
import VNSaveLoad from '../components/VNSaveLoad.vue'
import VNSettingsPanel from '../components/VNSettingsPanel.vue'

import '../vn-animations.css'

const router = useRouter()
const route = useRoute()
const vnStore = useVNStore()
const { scheduleSave } = useStorage()
const { showToast } = useToast()
const { startStory, sendChoice, sendInput } = useVNApi()
const { generateBackground, generateSprite, processSpriteCutout } = useImageGen()
const { speak, stopSpeaking } = useTTS()
const bgm = useBGM()

let currentSpeakPromise = null
let playbackRunId = 0

const showHistory = ref(false)
const showSave = ref(false)
const showSettings = ref(false)
const showMenu = ref(false)

const userInput = ref('')

const projectId = computed(() => String(route.params.projectId || ''))
const project = computed(() => {
  const list = vnStore.projects || []
  return Array.isArray(list) ? (list.find(p => p.id === projectId.value) || null) : null
})

const player = vnStore.player

const projectTitle = computed(() => project.value?.name || 'VN')

const sceneLabel = computed(() => {
  const scene = player.currentScene || {}
  const sceneParts = [scene.location, scene.time].map(value => String(value || '').trim()).filter(Boolean)
  if (sceneParts.length > 0) return sceneParts.join(' · ')

  const name = player.currentBg?.name
  if (!name) return projectTitle.value
  return name.replace(/_/g, ' \u00B7 ')
})

const showStartOverlay = computed(() => {
  if (!project.value) return false
  const hasAny = (project.value.history?.length || 0) > 0
  const hasScene = !!player.currentScene?.location || !!player.currentScene?.time
  const hasRuntime = !!player.currentDialog || !!player.currentBg || hasScene || (player.sprites?.length || 0) > 0
  return !hasAny && !hasRuntime && !player.isGenerating
})

const showInputBar = computed(() => {
  if (!project.value) return false
  if (showHistory.value || showSave.value || showSettings.value || showMenu.value) return false
  if (player.currentChoices) return false
  if (player.isPlaying) return false
  if (player._resolveWait) return false
  return (player.instructionQueue?.length || 0) === 0
})

onMounted(() => {
  if (!project.value) {
    router.replace('/vn')
    return
  }
  vnStore.setCurrentProject(projectId.value)
  vnStore.resetPlayer()
  document.addEventListener('keydown', handleKeydown)
})

function handleKeydown(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
  if (showHistory.value || showSave.value || showSettings.value || showMenu.value) {
    if (e.key === 'Escape') {
      showHistory.value = false
      showSave.value = false
      showSettings.value = false
      showMenu.value = false
    }
    return
  }

  switch (e.key) {
    case ' ':
    case 'Enter':
      e.preventDefault()
      handleTap()
      break
    case 'a': case 'A': toggleAutoPlay(); break
    case 'h': case 'H': showHistory.value = true; break
    case 's': case 'S': showSave.value = true; break
    case 'Escape': showMenu.value = true; break
  }
}

watch(projectId, () => {
  if (!project.value) return
  vnStore.setCurrentProject(projectId.value)
})

onBeforeUnmount(() => {
  cancelActivePlayback('unmount')
  stopSpeaking()
  bgm.stop()
  document.removeEventListener('keydown', handleKeydown)
})

function goHome() { cancelActivePlayback('leave'); stopSpeaking(); bgm.stop(); router.push('/vn') }
function goSetup() { router.push(`/vn/setup/${projectId.value}`) }
function goResources() { showMenu.value = false; router.push(`/vn/resources/${projectId.value}`) }
function toggleMenu() { showMenu.value = !showMenu.value }
function toggleAutoPlay() {
  if (player.isSkipping) {
    player.isSkipping = false
  } else if (player.isAutoPlay) {
    player.isAutoPlay = false
    player.isSkipping = true
    stopSpeaking()
  } else {
    player.isAutoPlay = true
  }
  // 唤醒等待中的推进循环，让它按新模式重新评估
  if (player._resolveWait) {
    const resolve = player._resolveWait
    player._resolveWait = null
    player.isWaitingInput = false
    resolve('mode')
  }
}

function cancelMode() {
  player.isAutoPlay = false
  player.isSkipping = false
  // 唤醒等待中的推进循环，让它退回到手动模式等待点击
  if (player._resolveWait) {
    const resolve = player._resolveWait
    player._resolveWait = null
    player.isWaitingInput = false
    resolve('mode')
  }
}

function onDialogComplete() { player.isPlaying = false }
function onNarrationComplete() { player.isPlaying = false }

function handleTap() {
  if (showHistory.value || showSave.value || showSettings.value || showMenu.value) return
  if (player.currentChoices) return

  if (player.isPlaying) {
    player.isPlaying = false
    return
  }

  if (player._resolveWait) {
    stopSpeaking()
    const resolve = player._resolveWait
    player._resolveWait = null
    player.isWaitingInput = false
    resolve('tap')
  }
}

function waitForUserInput() {
  return new Promise(resolve => {
    player.isWaitingInput = true
    player._resolveWait = (reason = 'tap') => resolve(reason)
  })
}

async function waitForAdvance() {
  while (true) {
    if (player.isSkipping) {
      await sleep(200)
      if (player.isSkipping) return
      continue
    }

    if (player.isAutoPlay) {
      const timer = Promise.all([
        sleep(player.autoPlayDelay || 2000),
        currentSpeakPromise
      ]).then(() => 'timer')
      const reason = await Promise.race([timer, waitForUserInput()])
      if (reason === 'timer') {
        player._resolveWait = null
        player.isWaitingInput = false
        if (player.isAutoPlay) return
        continue
      }
      if (reason === 'mode') continue
      return
    }

    const reason = await waitForUserInput()
    if (reason === 'mode') continue
    return
  }
}

async function start() {
  const res = await startStory()
  if (!res.success) {
    showToast(res.error || '剧情生成失败', 3200)
    return
  }
  await playInstructions(res.instructions || [])
  scheduleSave()
}

async function restartStory() {
  showMenu.value = false
  cancelActivePlayback('restart')
  stopSpeaking()
  bgm.stop()
  vnStore.resetPlayer()
  const res = await startStory()
  if (!res.success) {
    showToast(res.error || '剧情生成失败', 3200)
    return
  }
  await playInstructions(res.instructions || [])
  scheduleSave()
}

async function sendUserInput() {
  if (player.isGenerating) return
  const text = userInput.value.trim()
  userInput.value = ''
  const res = await sendInput(text || '继续推进一个完整的小场景，在产生明确剧情进展后再给出新的玩家选项。')
  if (!res.success) {
    showToast(res.error || '剧情生成失败', 3200)
    return
  }
  await playInstructions(res.instructions || [])
  scheduleSave()
}

async function onChoiceSelect(opt) {
  await submitChoice(opt?.text)
}

async function onCustomChoice(text) {
  await submitChoice(text)
}

async function submitChoice(value) {
  const text = String(value || '').trim()
  if (!text || player.isGenerating) return
  const previousChoices = player.currentChoices
  player.currentChoices = null
  const res = await sendChoice(text)
  if (!res.success) {
    player.currentChoices = previousChoices
    showToast(res.error || '剧情生成失败', 3200)
    return
  }
  await playInstructions(res.instructions || [])
  scheduleSave()
}

function cancelActivePlayback(reason = 'cancel') {
  playbackRunId += 1
  if (player._resolveWait) {
    const resolve = player._resolveWait
    player._resolveWait = null
    player.isWaitingInput = false
    resolve(reason)
  }
}

async function resumeLoadedGame(resumeState = {}) {
  showSave.value = false
  const resumeRunId = playbackRunId
  const pendingInstructions = Array.isArray(resumeState.pendingInstructions)
    ? resumeState.pendingInstructions
    : []

  if (player.currentChoices) {
    scheduleSave()
    return
  }

  if (resumeState.waitForAdvance && player.currentDialog) {
    player.isPlaying = false
    await waitForAdvance()
    if (resumeRunId !== playbackRunId) return
    if (resumeState.pendingCurrentInstruction) {
      vnStore.addToHistory(resumeState.pendingCurrentInstruction)
      scheduleSave()
    }
  }

  if (pendingInstructions.length > 0) {
    const pendingRunId = playbackRunId + 1
    await playInstructions(pendingInstructions)
    if (playbackRunId !== pendingRunId) return
    if (player.currentChoices) {
      scheduleSave()
      return
    }
  }

  if (resumeRunId !== playbackRunId && pendingInstructions.length === 0) return
  await generateAfterLoadedSave()
}

async function generateAfterLoadedSave() {
  const res = await sendInput('请从刚才的存档点自然继续剧情。使用 [dialog:角色名]台词和少量 [narration]，推进一个完整小场景，并以 3-4 个 [choices] 结束。')
  if (!res.success) {
    showToast(res.error || '读档后的剧情续写失败', 3200)
    return
  }
  await playInstructions(res.instructions || [])
  scheduleSave()
}

async function playInstructions(instructions) {
  const runId = ++playbackRunId
  player.instructionQueue = instructions
  player.instructionIndex = 0

  let inCondBlock = false
  let condSkipped = false

  for (let i = 0; i < instructions.length; i++) {
    if (runId !== playbackRunId) return
    player.instructionIndex = i
    const inst = instructions[i]

    // --- Conditional branch (single level, no nesting) ---
    if (inst.type === 'if') {
      inCondBlock = true
      condSkipped = !evalCondition(inst.expr)
      continue
    }
    if (inst.type === 'else') {
      if (inCondBlock) condSkipped = !condSkipped
      continue
    }
    if (inst.type === 'endif') {
      inCondBlock = false
      condSkipped = false
      continue
    }
    if (inCondBlock && condSkipped) continue

    switch (inst.type) {
      case 'bg':
        await handleBgInstruction(inst)
        break
      case 'scene':
        handleSceneInstruction(inst)
        break
      case 'sprite':
        await handleSpriteInstruction(inst)
        break
      case 'variable':
        handleVariableInstruction(inst)
        break
      case 'bgm':
        handleBgmInstruction(inst)
        break
      case 'dialog':
        await ensureDialogSprite(inst)
        await handleDialogInstruction(inst)
        await waitForAdvance()
        break
      case 'narration':
        await handleNarrationInstruction(inst)
        await waitForAdvance()
        break
      case 'choices':
        if (player.isAutoPlay || player.isSkipping) {
          player.isAutoPlay = false
          player.isSkipping = false
          showToast('遇到选项，自动播放已暂停', 2000)
        }
        player.currentChoices = inst.options || []
        vnStore.addToHistory(inst)
        scheduleSave()
        return
      default:
        break
    }

    if (runId !== playbackRunId) return

    vnStore.addToHistory(inst)
    scheduleSave()
  }

  if (runId === playbackRunId) {
    player.instructionQueue = []
    player.instructionIndex = 0
  }
}

function evalCondition(expr) {
  const s = String(expr || '').trim()
  if (!s) return false

  const m = s.match(/^(.+?)(>=|<=|==|!=|>|<)(.+)$/)
  if (!m) {
    const v = vnStore.getVariable(s, null)
    return !!v && v !== 0 && v !== '0' && v !== 'false'
  }

  const lhs = vnStore.getVariable(m[1].trim(), 0)
  const op = m[2]
  const rhsRaw = m[3].trim()
  const lhsNum = Number(lhs)
  const rhsNum = Number(rhsRaw)
  const numeric = rhsRaw !== '' && Number.isFinite(lhsNum) && Number.isFinite(rhsNum)

  switch (op) {
    case '>=': return numeric && lhsNum >= rhsNum
    case '<=': return numeric && lhsNum <= rhsNum
    case '>': return numeric && lhsNum > rhsNum
    case '<': return numeric && lhsNum < rhsNum
    case '==': return numeric ? lhsNum === rhsNum : String(lhs ?? '') === rhsRaw
    case '!=': return numeric ? lhsNum !== rhsNum : String(lhs ?? '') !== rhsRaw
    default: return false
  }
}

async function handleBgInstruction(inst) {
  let bg = vnStore.getResource('backgrounds', inst.name)
  if (!bg && inst.isNew && inst.prompt) {
    player.isGeneratingImage = true
    try {
      const url = await generateBackground(inst.name, inst.prompt)
      bg = { url }
    } catch {
      bg = { url: null }
    } finally {
      player.isGeneratingImage = false
    }
  }

  if (bg?.url) {
    player.currentBg = { name: inst.name, url: bg.url }
  } else {
    player.currentBg = { name: inst.name, url: null }
  }
  player.currentScene = { location: inst.name || '', time: '' }
}

function handleSceneInstruction(inst) {
  const current = player.currentScene || { location: '', time: '' }
  player.currentScene = {
    location: String(inst.location || current.location || '').trim(),
    time: String(inst.time || current.time || '').trim()
  }
}

async function handleSpriteInstruction(inst) {
  if (inst.position === 'none') {
    const idx = player.sprites.findIndex(s => s.characterId === inst.characterId)
    if (idx !== -1) {
      player.sprites[idx].animation = inst.animation || 'fadeOut'
      player.sprites[idx].isExiting = true
      await sleep(340)
      player.sprites.splice(idx, 1)
    }
    return
  }

  const resourceKey = `${inst.characterId}_${inst.expression}`
  let sprite = vnStore.getResource('sprites', resourceKey)

  if (!sprite && inst.isNew && inst.prompt) {
    const char = vnStore.currentProject?.characters?.find(
      c => c.contactId === inst.characterId || c.vnName === inst.vnName
    )
    if (char) {
      player.isGeneratingImage = true
      try {
        const url = await generateSprite(char, inst.expression)
        sprite = vnStore.getResource('sprites', resourceKey) || { url, autoCutout: true }
      } catch {
        sprite = { url: null }
      } finally {
        player.isGeneratingImage = false
      }
    }
  }

  if (sprite?.url && !sprite.autoCutout) {
    const url = await processSpriteCutout(sprite.url)
    sprite = { ...sprite, url, autoCutout: true }
    vnStore.setResource('sprites', resourceKey, sprite)
    scheduleSave()
  }

  const spriteUrl = sprite?.url || null
  const existing = player.sprites.findIndex(s => s.characterId === inst.characterId)
  const spriteData = {
    characterId: inst.characterId,
    vnName: inst.vnName,
    expression: inst.expression,
    position: inst.position,
    animation: inst.animation || (existing === -1 ? 'fadeIn' : null),
    url: spriteUrl,
    isExiting: false
  }

  if (existing !== -1) player.sprites[existing] = spriteData
  else player.sprites.push(spriteData)
}

async function ensureDialogSprite(inst) {
  const char = vnStore.currentProject?.characters?.find(
    c => c.contactId === inst.characterId || c.vnName === inst.vnName
  )
  if (!char) return

  const characterId = char.contactId || inst.characterId
  if (player.sprites.some(sprite => sprite.characterId === characterId && !sprite.isExiting)) return

  const occupied = new Set(player.sprites.map(sprite => sprite.position))
  const position = player.sprites.length === 0
    ? 'center'
    : (!occupied.has('right') ? 'right' : (!occupied.has('left') ? 'left' : 'center'))

  await handleSpriteInstruction({
    type: 'sprite',
    characterId,
    vnName: char.vnName || inst.vnName,
    position,
    expression: 'normal',
    isNew: false,
    prompt: null,
    animation: 'fadeIn'
  })
}

function handleVariableInstruction(inst) {
  if (!inst?.key) return
  const key = String(inst.key)
  if (inst.operation === 'add') {
    const current = Number(vnStore.getVariable(key, 0) || 0)
    vnStore.setVariable(key, current + Number(inst.value || 0))
  } else {
    vnStore.setVariable(key, inst.value)
  }
}

function handleBgmInstruction(inst) {
  if (inst.name === null || inst.name === 'stop') {
    bgm.stop()
  } else {
    bgm.play(inst.name)
  }
}

async function handleDialogInstruction(inst) {
  const char = vnStore.currentProject?.characters?.find(
    c => c.contactId === inst.characterId || c.vnName === inst.vnName
  )

  player.isPlaying = !player.isSkipping
  player.currentDialog = {
    characterId: inst.characterId,
    vnName: inst.vnName,
    text: inst.text,
    nameColor: char?.nameColor || '#e8a0bf',
    isNarration: false
  }

  currentSpeakPromise = player.isSkipping
    ? null
    : speak(inst.text, inst.characterId).catch(() => {})
}

async function handleNarrationInstruction(inst) {
  player.isPlaying = !player.isSkipping
  player.currentDialog = {
    characterId: '',
    vnName: '',
    text: inst.text,
    nameColor: '#ffffff',
    isNarration: true
  }

  currentSpeakPromise = player.isSkipping
    ? null
    : speak(inst.text, { isNarration: true }).catch(() => {})
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, ms || 0)))
}
</script>

<style scoped>
.vn-player {
  position: absolute;
  inset: 0;
  z-index: 20;
  background: #000;
  overflow: hidden;
}

/* ===== Top Bar ===== */
.vn-topbar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 50;
  padding: var(--app-pt, 12px) 14px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  pointer-events: none;
}

.vn-topbar > * {
  pointer-events: auto;
}

/* Glass circle button (back button) */
.vn-glass-circle {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.88);
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.22s ease;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
}

.vn-glass-circle:active {
  transform: scale(0.88);
  background: rgba(99, 102, 241, 0.45);
  border-color: rgba(99, 102, 241, 0.35);
}

/* Scene pill */
.vn-scene-pill {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 18px;
  border-radius: 22px;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.18);
  max-width: 52%;
}

.vn-scene-label {
  color: rgba(255, 255, 255, 0.85);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.vn-gen-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgba(99, 102, 241, 0.9);
  box-shadow: 0 0 8px rgba(99, 102, 241, 0.6);
  animation: vnGenPulse 1.4s ease-in-out infinite;
  flex-shrink: 0;
}

@keyframes vnGenPulse {
  0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 8px rgba(99, 102, 241, 0.6); }
  50% { opacity: 0.45; transform: scale(0.75); box-shadow: 0 0 4px rgba(99, 102, 241, 0.3); }
}

/* ===== Mode Pill (AUTO / SKIP) ===== */
.vn-mode-pill {
  position: absolute;
  top: calc(var(--app-pt, 12px) + 46px);
  left: 14px;
  z-index: 49;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(14px) saturate(150%);
  -webkit-backdrop-filter: blur(14px) saturate(150%);
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  cursor: pointer;
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.2);
  transition: transform 0.18s ease;
}

.vn-mode-pill:active { transform: scale(0.92); }

.vn-mode-pill.auto {
  background: rgba(99, 102, 241, 0.55);
  border-color: rgba(129, 140, 248, 0.5);
}

.vn-mode-pill.skip {
  background: rgba(234, 88, 12, 0.55);
  border-color: rgba(251, 146, 60, 0.5);
}

.vn-mode-pill i {
  font-size: 11px;
  opacity: 0.8;
}

.vn-mode-enter-active { transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.vn-mode-leave-active { transition: all 0.2s ease-in; }
.vn-mode-enter-from,
.vn-mode-leave-to { opacity: 0; transform: scale(0.85) translateY(-6px); }

/* ===== Generating Pill ===== */
.vn-gen-pill {
  position: absolute;
  left: 50%;
  bottom: 190px;
  transform: translateX(-50%);
  z-index: 48;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 18px;
  border-radius: 22px;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(16px) saturate(150%);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.9);
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
  pointer-events: none;
}

.vn-gen-pill i {
  font-size: 15px;
  color: #a5b4fc;
}

.vn-gen-spin {
  animation: vnGenSpin 1s linear infinite;
}

@keyframes vnGenSpin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.vn-gen-enter-active { transition: all 0.3s ease; }
.vn-gen-leave-active { transition: all 0.25s ease; }
.vn-gen-enter-from,
.vn-gen-leave-to { opacity: 0; transform: translateX(-50%) translateY(8px); }

/* ===== Input Bar ===== */
.vn-input-area {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 42;
  padding: 0 14px calc(var(--app-pb, 8px) + 12px);
  pointer-events: none;
}

.vn-input-glass {
  pointer-events: auto;
  max-width: 540px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 5px 5px 18px;
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(24px) saturate(170%);
  -webkit-backdrop-filter: blur(24px) saturate(170%);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 999px;
  box-shadow:
    0 4px 20px rgba(0, 0, 0, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.4);
}

.vn-input-field {
  flex: 1;
  background: transparent;
  outline: none;
  color: rgba(20, 20, 40, 0.85);
  font-size: 14px;
  min-width: 0;
  border: none;
}

.vn-input-field::placeholder {
  color: rgba(20, 20, 40, 0.3);
}

.vn-input-send {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.9), rgba(129, 140, 248, 0.9));
  color: #fff;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  border: none;
  transition: all 0.18s ease;
  box-shadow: 0 3px 12px rgba(99, 102, 241, 0.35);
}

.vn-input-send:active {
  transform: scale(0.9);
}

.vn-input-send:disabled {
  opacity: 0.35;
  box-shadow: none;
}

/* Input transition */
.vn-input-enter-active { transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.vn-input-leave-active { transition: all 0.2s ease-in; }
.vn-input-enter-from,
.vn-input-leave-to { opacity: 0; transform: translateY(20px); }

/* ===== Panel transition ===== */
.vn-panel-enter-active { transition: opacity 0.3s ease; }
.vn-panel-leave-active { transition: opacity 0.2s ease; }
.vn-panel-enter-from,
.vn-panel-leave-to { opacity: 0; }

/* ===== Menu Bottom Sheet ===== */
.vn-menu-backdrop {
  position: absolute;
  inset: 0;
  z-index: 70;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 20px 16px;
}

.vn-menu-sheet {
  width: 100%;
  max-width: 420px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(36px) saturate(190%);
  -webkit-backdrop-filter: blur(36px) saturate(190%);
  border: 1px solid rgba(255, 255, 255, 0.65);
  border-radius: 24px;
  box-shadow:
    0 -4px 30px rgba(0, 0, 0, 0.1),
    0 16px 56px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  padding: 6px 8px 8px;
}

.vn-menu-handle {
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: rgba(0, 0, 0, 0.12);
  margin: 6px auto 10px;
}

.vn-menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 600;
  color: rgba(20, 20, 40, 0.82);
  cursor: pointer;
  border: none;
  background: transparent;
  transition: background 0.15s ease;
}

.vn-menu-item:hover {
  background: rgba(99, 102, 241, 0.06);
}

.vn-menu-item:active {
  background: rgba(99, 102, 241, 0.12);
}

.vn-menu-item i {
  font-size: 20px;
  color: rgba(99, 102, 241, 0.7);
}

.vn-menu-item.danger {
  color: #ef4444;
}

.vn-menu-item.danger i {
  color: #ef4444;
}

.vn-menu-divider {
  height: 1px;
  background: rgba(0, 0, 0, 0.06);
  margin: 4px 18px;
}

.vn-menu-cancel {
  width: 100%;
  padding: 14px;
  border-radius: 14px;
  text-align: center;
  font-size: 15px;
  font-weight: 600;
  color: rgba(20, 20, 40, 0.45);
  cursor: pointer;
  border: none;
  background: transparent;
  transition: background 0.15s ease;
}

.vn-menu-cancel:active {
  background: rgba(0, 0, 0, 0.05);
}

/* Menu transition */
.vn-menu-enter-active { transition: opacity 0.28s ease; }
.vn-menu-leave-active { transition: opacity 0.2s ease; }
.vn-menu-enter-from,
.vn-menu-leave-to { opacity: 0; }

.vn-menu-enter-active .vn-menu-sheet {
  transition: transform 0.38s cubic-bezier(0.16, 1, 0.3, 1);
}
.vn-menu-leave-active .vn-menu-sheet {
  transition: transform 0.22s ease-in;
}
.vn-menu-enter-from .vn-menu-sheet {
  transform: translateY(100%);
}
.vn-menu-leave-to .vn-menu-sheet {
  transform: translateY(30%);
}

/* ===== Start Overlay ===== */
.vn-start-overlay {
  position: absolute;
  inset: 0;
  z-index: 65;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.vn-start-card {
  position: relative;
  width: 100%;
  max-width: 420px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(36px) saturate(190%);
  -webkit-backdrop-filter: blur(36px) saturate(190%);
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 28px;
  box-shadow:
    0 16px 56px rgba(0, 0, 0, 0.12),
    0 2px 12px rgba(99, 102, 241, 0.08);
  padding: 40px 30px 30px;
  text-align: center;
  overflow: hidden;
}

.vn-start-glow {
  position: absolute;
  top: -40px;
  left: 50%;
  transform: translateX(-50%);
  width: 200px;
  height: 120px;
  background: radial-gradient(ellipse, rgba(99, 102, 241, 0.15), transparent 70%);
  pointer-events: none;
}

.vn-start-deco {
  position: relative;
  color: rgba(99, 102, 241, 0.25);
  font-size: 16px;
  letter-spacing: 0.5em;
  margin-bottom: 18px;
}

.vn-start-title {
  position: relative;
  font-family: 'Noto Serif SC', Georgia, serif;
  font-size: 26px;
  font-weight: 700;
  color: rgba(20, 20, 40, 0.9);
  letter-spacing: 0.06em;
  background: linear-gradient(135deg, rgba(20, 20, 40, 0.9), rgba(99, 102, 241, 0.8));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.vn-start-desc {
  position: relative;
  margin-top: 14px;
  font-size: 14px;
  line-height: 1.75;
  color: rgba(20, 20, 40, 0.48);
}

.vn-start-actions {
  position: relative;
  margin-top: 28px;
  display: flex;
  gap: 12px;
}

.vn-start-btn {
  flex: 1;
  height: 48px;
  border-radius: 16px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: none;
  transition: all 0.2s ease;
}

.vn-start-btn:active {
  transform: scale(0.96);
}

.vn-start-btn:disabled {
  opacity: 0.35;
}

.vn-start-btn.secondary {
  background: rgba(0, 0, 0, 0.05);
  color: rgba(20, 20, 40, 0.65);
  border: 1px solid rgba(0, 0, 0, 0.07);
}

.vn-start-btn.secondary:active {
  background: rgba(0, 0, 0, 0.08);
}

.vn-start-btn.primary {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.9), rgba(129, 140, 248, 0.95));
  color: #fff;
  box-shadow: 0 4px 20px rgba(99, 102, 241, 0.35);
}

.vn-start-btn.primary:active {
  box-shadow: 0 2px 10px rgba(99, 102, 241, 0.25);
}

/* Start overlay transition */
.vn-start-enter-active { transition: opacity 0.45s ease; }
.vn-start-leave-active { transition: opacity 0.3s ease; }
.vn-start-enter-from,
.vn-start-leave-to { opacity: 0; }

.vn-start-enter-active .vn-start-card {
  transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease;
}
.vn-start-enter-from .vn-start-card {
  opacity: 0;
  transform: scale(0.92) translateY(20px);
}
</style>
