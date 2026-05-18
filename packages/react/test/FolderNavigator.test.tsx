// biome-ignore-all lint/style/noNonNullAssertion: test fixtures and statically-known DOM/array shapes are asserted by the test setup, not by runtime checks.
import type { Folder } from '@ensemble-sheets/core'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FolderNavigator } from '../src/FolderNavigator'

function makeApi(initial: Folder[]) {
  let items = initial
  return {
    listFolders: vi.fn(async () => ({ items })),
    createFolder: vi.fn(
      async (input: {
        name: string
        parentId: string | null
        spaceType: 'personal' | 'shared'
      }) => {
        const f: Folder = {
          id: `new-${items.length}`,
          tenantId: 't',
          parentId: input.parentId,
          name: input.name,
          ownerId: 'u',
          spaceType: input.spaceType,
          isDeleted: false,
          createdAt: '',
          updatedAt: '',
        }
        items = [...items, f]
        return f
      },
    ),
    deleteFolder: vi.fn(async (id: string) => {
      items = items.filter((f) => f.id !== id)
    }),
    renameFolder: vi.fn(async () => items[0]),
    moveFolder: vi.fn(async () => items[0]),
  }
}

describe('<FolderNavigator />', () => {
  it('renders root folders fetched from api.listFolders', async () => {
    const api = makeApi([
      {
        id: 'a',
        tenantId: 't',
        parentId: null,
        name: 'Personal',
        ownerId: 'u',
        spaceType: 'personal',
        isDeleted: false,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'b',
        tenantId: 't',
        parentId: null,
        name: 'Shared',
        ownerId: 'u',
        spaceType: 'shared',
        isDeleted: false,
        createdAt: '',
        updatedAt: '',
      },
    ])
    const { findByText } = render(<FolderNavigator api={api as never} onSelect={() => {}} />)
    await findByText('Personal')
    await findByText('Shared')
  })

  it('clicking + creates a folder under root', async () => {
    const api = makeApi([])
    const { getByLabelText, findByText } = render(
      <FolderNavigator api={api as never} onSelect={() => {}} />,
    )
    fireEvent.click(getByLabelText('新建文件夹'))
    const input = getByLabelText('文件夹名称')
    fireEvent.change(input, { target: { value: 'New' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() =>
      expect(api.createFolder).toHaveBeenCalledWith({
        name: 'New',
        parentId: null,
        spaceType: 'personal',
      }),
    )
    await findByText('New')
  })
})
