<script setup lang="ts">
import type { ApiClient, Folder } from '@ensemble/core'
import { onMounted, ref } from 'vue'

const props = defineProps<{
  api: Pick<ApiClient, 'listFolders' | 'createFolder' | 'renameFolder' | 'moveFolder' | 'deleteFolder'>
  onSelect: (folder: Folder) => void
}>()

const folders = ref<Folder[]>([])
const creating = ref(false)
const draftName = ref('')

async function refresh() {
  const { items } = await props.api.listFolders()
  folders.value = items.filter((f) => !f.isDeleted)
}

async function submit() {
  if (!draftName.value.trim()) return
  await props.api.createFolder({ name: draftName.value, parentId: null, spaceType: 'personal' })
  creating.value = false
  draftName.value = ''
  await refresh()
}

onMounted(refresh)
</script>

<template>
  <div class="ensemble-folder-navigator">
    <header style="display: flex; align-items: center; gap: 8px">
      <strong>Folders</strong>
      <button aria-label="Create folder" @click="creating = true">+</button>
    </header>
    <form v-if="creating" @submit.prevent="submit">
      <input v-model="draftName" aria-label="Folder name" autofocus />
    </form>
    <ul>
      <li v-for="f in folders.filter((x) => x.parentId === null)" :key="f.id">
        <button @click="props.onSelect(f)">{{ f.name }}</button>
        <span style="margin-left: 8px; font-size: 0.85em; color: #888">{{ f.spaceType }}</span>
      </li>
    </ul>
  </div>
</template>
