import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { VersionHistoryPanel } from '../src/VersionHistoryPanel'
import type { Version } from '@ensemble/core'

function makeApi(initial: Version[]) {
  let items = initial
  return {
    listVersions: vi.fn(async () => ({ items })),
    createVersion: vi.fn(async (_wb: string, name: string): Promise<Version> => {
      const v: Version = { id: 'new-' + items.length, workbookId: 'wb', name, createdBy: 'u', createdAt: '' }
      items = [...items, v]
      return v
    }),
    restoreVersion: vi.fn(async () => ({ id: 'r1' })),
  }
}

describe('<VersionHistoryPanel />', () => {
  it('lists existing versions', async () => {
    const api = makeApi([{ id: 'v1', workbookId: 'wb', name: 'V1', createdBy: 'u', createdAt: '' }])
    const { findByText } = render(<VersionHistoryPanel api={api as never} workbookId="wb" />)
    await findByText('V1')
  })

  it('creates version on submit', async () => {
    const api = makeApi([])
    const { getByLabelText, findByText } = render(<VersionHistoryPanel api={api as never} workbookId="wb" />)
    fireEvent.click(getByLabelText('Save version'))
    const input = getByLabelText('Version name')
    fireEvent.change(input, { target: { value: 'My' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => expect(api.createVersion).toHaveBeenCalledWith('wb', 'My'))
    await findByText('My')
  })

  it('restore invokes api.restoreVersion', async () => {
    const api = makeApi([{ id: 'v1', workbookId: 'wb', name: 'V1', createdBy: 'u', createdAt: '' }])
    const { findByText, getByText } = render(<VersionHistoryPanel api={api as never} workbookId="wb" />)
    await findByText('V1')
    fireEvent.click(getByText('Restore'))
    await waitFor(() => expect(api.restoreVersion).toHaveBeenCalledWith('wb', 'v1'))
  })
})
