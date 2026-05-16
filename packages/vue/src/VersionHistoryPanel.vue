<script setup lang="ts">
import type { ApiClient, Version } from '@ensemble/core'
import { onMounted, ref } from 'vue'

const props = defineProps<{
  api: Pick<ApiClient, 'listVersions' | 'createVersion' | 'restoreVersion'>
  workbookId: string
}>()
const emit = defineEmits<{ restored: [] }>()

const items = ref<Version[]>([])
const creating = ref(false)
const draftName = ref('')

async function refresh() {
  const { items: list } = await props.api.listVersions(props.workbookId)
  items.value = list
}
async function submit() {
  if (!draftName.value.trim()) return
  await props.api.createVersion(props.workbookId, draftName.value)
  creating.value = false; draftName.value = ''
  await refresh()
}
async function restore(versionId: string) {
  await props.api.restoreVersion(props.workbookId, versionId)
  emit('restored')
}
onMounted(refresh)
</script>

<template>
  <div class="ensemble-version-history">
    <header style="display: flex; gap: 8px; align-items: center">
      <strong>Version history</strong>
      <button aria-label="Save version" @click="creating = true">+</button>
    </header>
    <form v-if="creating" @submit.prevent="submit">
      <input v-model="draftName" aria-label="Version name" autofocus />
    </form>
    <ul>
      <li v-for="v in items" :key="v.id" style="display: flex; gap: 12px; align-items: center">
        <span>{{ v.name }}</span>
        <button @click="restore(v.id)">Restore</button>
      </li>
    </ul>
  </div>
</template>
