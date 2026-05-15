import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import WorkbookEditor from '../src/WorkbookEditor.vue'

vi.mock('@ensemble/core', () => ({
  mountWorkbookEditor: vi.fn(async () => ({
    save: vi.fn(), exportXlsx: vi.fn(() => new Uint8Array()), destroy: vi.fn(),
  })),
}))

describe('<WorkbookEditor /> (Vue)', () => {
  it('mounts and calls mountWorkbookEditor', async () => {
    const wrapper = mount(WorkbookEditor, {
      props: { workbookId: 'w', apiBaseUrl: 'a', wsBaseUrl: 'w', token: () => 't' },
    })
    await wrapper.vm.$nextTick()
    const { mountWorkbookEditor } = await import('@ensemble/core')
    expect(mountWorkbookEditor).toHaveBeenCalled()
    expect(wrapper.element.classList.contains('ensemble-workbook-root')).toBe(true)
  })
})
