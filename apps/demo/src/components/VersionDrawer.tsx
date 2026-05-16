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
    <Drawer side="right" open={open} onClose={onClose} title="Version history">
      <VersionHistoryPanel api={api} workbookId={workbookId} onRestore={onRestore} />
      <p style={{ marginTop: 12, fontSize: 12, color: '#6b7280' }}>
        Named versions are full snapshots — restore replays them as a new snapshot. The editor
        reloads automatically so all open tabs see the same content.
      </p>
    </Drawer>
  )
}
