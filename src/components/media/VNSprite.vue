<template>
  <div
    class="absolute bottom-[18vh] h-[72vh] w-[70vw] max-w-[420px] select-none transition-all duration-700 ease-out"
    :style="positionStyle"
  >
    <div
      class="absolute inset-0 origin-bottom transition-transform duration-300 ease-out"
      :style="scaleStyle"
    >
      <div
        class="absolute inset-0 flex items-end justify-center"
        :class="[idleClass, animClass]"
      >
        <img
          v-if="imageUrl"
          :src="imageUrl"
          class="h-full w-auto object-contain drop-shadow-[0_20px_40px_rgba(0,0,0,0.5)]"
          :alt="vnName || characterId"
          draggable="false"
          @load="analyzeSpriteBounds"
        >
        <div
          v-else
          class="w-full h-full rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/60 text-sm px-4 text-center"
        >
          {{ vnName || characterId }}
          <span v-if="expression" class="opacity-50 ml-1"> · {{ expression }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  characterId: { type: String, default: '' },
  vnName: { type: String, default: '' },
  expression: { type: String, default: '' },
  position: { type: String, default: 'center' },
  animation: { type: String, default: null },
  imageUrl: { type: String, default: '' },
  isExiting: { type: Boolean, default: false },
  manualScale: { type: Number, default: null }
})

const autoScale = ref(1)

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

const effectiveScale = computed(() => {
  const manual = Number(props.manualScale)
  if (Number.isFinite(manual) && manual > 0) return clamp(manual, 0.6, 2)
  return autoScale.value
})

const scaleStyle = computed(() => ({
  transform: `scale(${effectiveScale.value})`
}))

function analyzeSpriteBounds(event) {
  autoScale.value = 1
  const image = event?.currentTarget
  if (!image?.naturalWidth || !image?.naturalHeight) return

  try {
    const maxSampleSize = 220
    const ratio = Math.min(1, maxSampleSize / image.naturalWidth, maxSampleSize / image.naturalHeight)
    const width = Math.max(1, Math.round(image.naturalWidth * ratio))
    const height = Math.max(1, Math.round(image.naturalHeight * ratio))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return

    context.drawImage(image, 0, 0, width, height)
    const pixels = context.getImageData(0, 0, width, height).data
    let minY = height
    let maxY = -1
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (pixels[(y * width + x) * 4 + 3] < 24) continue
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
      }
    }

    if (maxY < minY) return
    const visibleHeightRatio = (maxY - minY + 1) / height
    autoScale.value = clamp(0.92 / Math.max(visibleHeightRatio, 0.35), 1, 1.65)
  } catch {
    // 跨域图片无法读取像素时保持 100%，仍可在设置中手动调整。
    autoScale.value = 1
  }
}

watch(() => props.imageUrl, () => {
  autoScale.value = 1
})

const positionStyle = computed(() => {
  const map = {
    left: { left: '4%', transform: 'translateX(0)' },
    center: { left: '50%', transform: 'translateX(-50%)' },
    right: { right: '4%', transform: 'translateX(0)' }
  }
  return map[props.position] || map.center
})

const idleClass = computed(() => {
  return props.isExiting ? '' : 'vn-sprite-idle'
})

const animClass = computed(() => {
  const a = (props.animation || '').trim()
  if (!a) return ''

  if (props.isExiting) return `vn-sprite-exit-${a}`

  const enterSet = new Set(['fadeIn', 'slideLeft', 'slideRight', 'slideUp', 'bounce'])
  const emotionSet = new Set(['shake', 'jump', 'nod'])

  if (enterSet.has(a)) return `vn-sprite-enter-${a}`
  if (emotionSet.has(a)) return `vn-sprite-emotion-${a}`

  return ''
})
</script>
