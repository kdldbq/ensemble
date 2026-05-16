<script setup lang="ts">
import type { WsClient } from '@ensemble-sheets/core'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import LockBadge from './LockBadge.vue'

const props = defineProps<{ wsClient: Pick<WsClient, 'onLockEvent'>; class?: string }>()
const locks = ref<Record<string, string>>({})
let unsub: (() => void) | null = null

onMounted(() => {
  unsub = props.wsClient.onLockEvent((frame) => {
    if (frame.type === 'lock_acquired') {
      locks.value = { ...locks.value, [frame.region as string]: frame.ownerId as string }
    } else if (frame.type === 'lock_released') {
      const next = { ...locks.value }
      delete next[frame.region as string]
      locks.value = next
    }
  })
})
onBeforeUnmount(() => {
  unsub?.()
})
</script>

<template>
  <div :class="['ensemble-cell-lock-overlay', props.class]" aria-live="polite">
    <div v-for="(ownerId, region) in locks" :key="region" :data-region="region"
         style="display: inline-block; margin-right: 8px">
      <span style="margin-right: 4px; font-family: monospace">{{ region }}</span>
      <LockBadge :owner-id="ownerId" />
    </div>
  </div>
</template>
