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

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <div className="ensemble-version-history">
      <header style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <strong>版本历史</strong>
        <button type="button" aria-label="保存版本" onClick={() => setCreating(true)}>
          +
        </button>
      </header>
      {creating && (
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!draftName.trim()) return
            await api.createVersion(workbookId, draftName)
            setCreating(false)
            setDraftName('')
            await refresh()
          }}
        >
          <input
            aria-label="版本名称"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
          />
        </form>
      )}
      <ul>
        {items.map((v) => (
          <li key={v.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span>{v.name}</span>
            <button
              type="button"
              onClick={async () => {
                await api.restoreVersion(workbookId, v.id)
                onRestore?.()
              }}
            >
              恢复
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
