import type { ApiClient, Version } from '@ensemble-sheets/core'
import { useCallback, useEffect, useState } from 'react'

export interface VersionHistoryPanelProps {
  api: Pick<ApiClient, 'listVersions' | 'createVersion' | 'restoreVersion'>
  workbookId: string
  onRestore?: () => void
}

export function VersionHistoryPanel({ api, workbookId, onRestore }: VersionHistoryPanelProps) {
  const [items, setItems] = useState<Version[]>([])
  const [creating, setCreating] = useState(false)
  const [draftName, setDraftName] = useState('')

  const refresh = useCallback(async () => {
    const { items } = await api.listVersions(workbookId)
    setItems(items)
  }, [api, workbookId])

  useEffect(() => { void refresh() }, [refresh])

  return (
    <div className="ensemble-version-history">
      <header style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <strong>Version history</strong>
        <button aria-label="Save version" onClick={() => setCreating(true)}>+</button>
      </header>
      {creating && (
        <form onSubmit={async (e) => {
          e.preventDefault()
          if (!draftName.trim()) return
          await api.createVersion(workbookId, draftName)
          setCreating(false); setDraftName('')
          await refresh()
        }}>
          <input aria-label="Version name" value={draftName}
                 onChange={(e) => setDraftName(e.target.value)} autoFocus />
        </form>
      )}
      <ul>
        {items.map((v) => (
          <li key={v.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span>{v.name}</span>
            <button onClick={async () => { await api.restoreVersion(workbookId, v.id); onRestore?.() }}>
              Restore
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
