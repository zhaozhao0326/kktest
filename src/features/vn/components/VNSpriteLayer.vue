<template>
  <div class="absolute inset-0 pointer-events-none z-10 overflow-hidden">
    <VNSprite
      v-for="sp in sprites"
      :key="sp.characterId"
      :character-id="sp.characterId"
      :vn-name="sp.vnName"
      :expression="sp.expression"
      :position="sp.position"
      :animation="sp.animation"
      :image-url="sp.url"
      :is-exiting="!!sp.isExiting"
      :manual-scale="getManualScale(sp.characterId)"
    />
  </div>
</template>

<script setup>
import VNSprite from '../../../components/media/VNSprite.vue'
import { useVNStore } from '../../../stores/vn'

const vnStore = useVNStore()

defineProps({
  sprites: { type: Array, default: () => [] }
})

function getManualScale(characterId) {
  const character = vnStore.currentProject?.characters?.find(char => char.contactId === characterId)
  const value = Number(character?.spriteScale)
  return Number.isFinite(value) && value > 0 ? value : null
}
</script>
