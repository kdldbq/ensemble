import type { ApiClient, Folder } from '@ensemble-sheets/core'
import { FolderNavigator } from '@ensemble-sheets/react'
import { Drawer } from './Drawer'

export interface FolderDrawerProps {
  api: ApiClient
  open: boolean
  canEdit?: boolean
  onClose: () => void
  onSelect: (folder: Folder) => void
}

export function FolderDrawer({ api, open, canEdit = true, onClose, onSelect }: FolderDrawerProps) {
  return (
    <Drawer side="left" open={open} onClose={onClose} title="文件夹">
      <FolderNavigator
        api={api}
        canEdit={canEdit}
        onSelect={(folder) => {
          onSelect(folder)
          onClose()
        }}
      />
      <p style={{ marginTop: 12, fontSize: 12, color: '#6b7280' }}>
        鼠标悬停文件夹行可见 ✎ 重命名 / ⇨ 移动 / 🗑 删除 按钮；查看者角色下这些按钮隐藏。
        目录结构按租户隔离；本演示所有访客共享同一租户。
      </p>
    </Drawer>
  )
}
