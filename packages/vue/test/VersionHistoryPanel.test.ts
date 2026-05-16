import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import VersionHistoryPanel from '../src/VersionHistoryPanel.vue'

function makeApi(initial: { id: string; name: string }[] = []) {
  let items = initial
  return {
    listVersions: vi.fn(async () => ({ items })),
    createVersion: vi.fn(async (_wb: string, name: string) => {
      const v = { id: 'n' + items.length, name }
      items = [...items, v as never]
      return v
    }),
    restoreVersion: vi.fn(async () => ({ id: 'r1' })),
  }
}

describe('<VersionHistoryPanel /> Vue', () => {
  it('renders fetched versions', async () => {
    const api = makeApi([{ id: 'v1', name: 'V1' }])
    const wrapper = mount(VersionHistoryPanel, { props: { api, workbookId: 'wb' } })
    await new Promise((r) => setTimeout(r, 0))
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('V1')
  })
  it('creates version on submit', async () => {
    const api = makeApi()
    const wrapper = mount(VersionHistoryPanel, { props: { api, workbookId: 'wb' } })
    await wrapper.vm.$nextTick()
    await wrapper.find('[aria-label="Save version"]').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.find('input[aria-label="Version name"]').setValue('My v')
    await wrapper.find('form').trigger('submit.prevent')
    expect(api.createVersion).toHaveBeenCalled()
  })
})
