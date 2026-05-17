import type { ApiClient, Folder } from '@ensemble-sheets/core'
import { FolderTree } from '@ensemble-sheets/react'
import { Drawer } from './Drawer'

export interface FolderDrawerProps {
  api: ApiClient
  open: boolean
  canEdit?: boolean
  onClose: () => void
  onSelect: (folder: Folder) => void
  /** Used to scope localStorage expand state per tenant. */
  storageKey?: string
  selectedId?: string | null
}

export function FolderDrawer({
  api,
  open,
  canEdit = true,
  onClose,
  onSelect,
  storageKey,
  selectedId,
}: FolderDrawerProps) {
  return (
    <Drawer side="left" open={open} onClose={onClose} title="文件夹">
      <FolderTree
        api={api}
        canEdit={canEdit}
        {...(storageKey !== undefined ? { storageKey } : {})}
        {...(selectedId !== undefined ? { selectedId } : {})}
        onSelect={(folder) => {
          onSelect(folder)
          if (folder.id) onClose()
        }}
      />
      <p style={{ marginTop: 12, fontSize: 12, color: '#6b7280' }}>
        点击 ▶ 展开子项；F2 重命名，Delete 删除（可在回收站恢复）；搜索框过滤 / 顶部切换活跃 ↔
        回收站。 目录结构按租户隔离；本演示所有访客共享同一租户。
      </p>
    </Drawer>
  )
}
