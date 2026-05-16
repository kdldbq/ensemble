import type { ApiClient } from '@ensemble-sheets/core'
import { VersionHistoryPanel } from '@ensemble-sheets/react'
import { Drawer } from './Drawer'

export interface VersionDrawerProps {
  api: ApiClient
  workbookId: string
  open: boolean
  onClose: () => void
  onRestore: () => void
}

export function VersionDrawer({ api, workbookId, open, onClose, onRestore }: VersionDrawerProps) {
  return (
    <Drawer side="right" open={open} onClose={onClose} title="版本历史">
      <VersionHistoryPanel api={api} workbookId={workbookId} onRestore={onRestore} />
      <p style={{ marginTop: 12, fontSize: 12, color: '#6b7280' }}>
        命名版本是完整快照；恢复会把它另存为新快照。编辑器会自动重载，所有打开的页签看到一致内容。
      </p>
    </Drawer>
  )
}
