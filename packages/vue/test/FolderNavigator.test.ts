import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import FolderNavigator from '../src/FolderNavigator.vue'

const makeApi = (initial: { id: string; name: string; parentId: string | null; spaceType: string; isDeleted: boolean }[] = []) => {
  let items = initial
  return {
    listFolders: vi.fn(async () => ({ items })),
    createFolder: vi.fn(async (input: { name: string; parentId: string | null; spaceType: 'personal' | 'shared' }) => {
      const f = { id: 'n' + items.length, ...input, ownerId: 'u', isDeleted: false }
      items = [...items, f as never]
      return f
    }),
    renameFolder: vi.fn(),
    moveFolder: vi.fn(),
    deleteFolder: vi.fn(),
  }
}

describe('<FolderNavigator /> Vue', () => {
  it('renders fetched folders', async () => {
    const api = makeApi([
      { id: 'a', name: 'Personal', parentId: null, spaceType: 'personal', isDeleted: false },
    ])
    const wrapper = mount(FolderNavigator, { props: { api, onSelect: () => {} } })
    await new Promise((r) => setTimeout(r, 0))
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Personal')
  })

  it('creates a folder on form submit', async () => {
    const api = makeApi()
    const wrapper = mount(FolderNavigator, { props: { api, onSelect: () => {} } })
    await wrapper.vm.$nextTick()
    await wrapper.find('[aria-label="Create folder"]').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.find('input[aria-label="Folder name"]').setValue('New')
    await wrapper.find('form').trigger('submit.prevent')
    expect(api.createFolder).toHaveBeenCalled()
  })
})
