import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WorkbookEditor } from '../src/WorkbookEditor'

vi.mock('@ensemble-sheets/core', () => ({
  mountWorkbookEditor: vi.fn(async () => ({
    save: vi.fn(),
    exportXlsx: vi.fn(() => new Uint8Array()),
    destroy: vi.fn(),
  })),
}))

describe('<WorkbookEditor />', () => {
  it('calls mountWorkbookEditor with the right props', async () => {
    const { container } = render(
      <WorkbookEditor
        workbookId="w1"
        apiBaseUrl="https://api"
        wsBaseUrl="wss://api"
        token={async () => 't'}
      />
    )
    const { mountWorkbookEditor } = await import('@ensemble-sheets/core')
    expect(mountWorkbookEditor as unknown as { mock: unknown }).toBeDefined()
    expect(mountWorkbookEditor).toHaveBeenCalledWith(
      expect.objectContaining({ workbookId: 'w1', apiBaseUrl: 'https://api' })
    )
    expect(container.querySelector('.ensemble-workbook-root')).toBeTruthy()
  })
})
