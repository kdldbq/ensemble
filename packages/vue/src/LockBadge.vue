<script setup lang="ts">
const props = defineProps<{ ownerId: string; class?: string }>()
</script>

<template>
  <span>
    <span
      v-if="props.ownerId"
      :class="['ensemble-lock-badge', props.class]"
      :title="`${props.ownerId} is editing this cell`"
      style="display: inline-block; padding: 2px 6px; background: #fef3c7; border: 1px solid #fbbf24; border-radius: 4px; font-size: 11px; color: #92400e"
    >
      {{ props.ownerId }} editing
    </span>
  </span>
</template>
