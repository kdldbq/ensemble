<script setup lang="ts">
import { type MountHandle, mountWorkbookEditor } from '@ensemble-sheets/core'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  workbookId: string
  apiBaseUrl: string
  wsBaseUrl: string
  token: () => string | Promise<string>
}>()

const emit = defineEmits<{ ready: [handle: MountHandle] }>()
const containerRef = ref<HTMLDivElement | null>(null)
let handle: MountHandle | null = null

async function mountNow() {
  if (!containerRef.value) return
  void handle?.destroy()
  handle = await mountWorkbookEditor({
    container: containerRef.value,
    workbookId: props.workbookId,
    apiBaseUrl: props.apiBaseUrl,
    wsBaseUrl: props.wsBaseUrl,
    token: props.token,
  })
  emit('ready', handle)
}

onMounted(mountNow)
onBeforeUnmount(() => handle?.destroy())
watch(() => [props.workbookId, props.apiBaseUrl, props.wsBaseUrl], mountNow)
</script>

<template>
  <div ref="containerRef" class="ensemble-workbook-root" style="width: 100%; height: 100%" />
</template>
