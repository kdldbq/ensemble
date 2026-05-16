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
    <Drawer side="left" open={open} onClose={onClose} title="文件夹">
      <FolderNavigator
        api={api}
        onSelect={(folder) => {
          onSelect(folder)
          onClose()
        }}
      />
      <p style={{ marginTop: 12, fontSize: 12, color: '#6b7280' }}>
        新建文件夹、重命名，把工作簿拖进去。目录结构按租户隔离；本演示所有访客共享同一租户。
      </p>
    </Drawer>
  )
}
