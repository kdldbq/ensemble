import type { ApiClient, Folder } from '@ensemble-sheets/core'
import { FolderNavigator } from '@ensemble-sheets/react'
import { Drawer } from './Drawer'

export interface FolderDrawerProps {
  api: ApiClient
  open: boolean
  onClose: () => void
  onSelect: (folder: Folder) => void
}

export function FolderDrawer({ api, open, onClose, onSelect }: FolderDrawerProps) {
  return (
    <Drawer side="left" open={open} onClose={onClose} title="Folders">
      <FolderNavigator
        api={api}
        onSelect={(folder) => {
          onSelect(folder)
          onClose()
        }}
      />
      <p style={{ marginTop: 12, fontSize: 12, color: '#6b7280' }}>
        Create a folder, rename it, then drop a workbook into it. Tree structure is per tenant; in
        this demo every visitor shares the same tenant.
      </p>
    </Drawer>
  )
}
