import type { ApiClient, Folder } from '@ensemble-sheets/core'
import { useCallback, useEffect, useState } from 'react'

export interface FolderNavigatorProps {
  api: Pick<
    ApiClient,
    'listFolders' | 'createFolder' | 'renameFolder' | 'moveFolder' | 'deleteFolder'
  >
  onSelect: (folder: Folder) => void
}

export function FolderNavigator({ api, onSelect }: FolderNavigatorProps) {
  const [folders, setFolders] = useState<Folder[]>([])
  const [creating, setCreating] = useState(false)
  const [draftName, setDraftName] = useState('')

  const refresh = useCallback(async () => {
    const { items } = await api.listFolders()
    setFolders(items.filter((f) => !f.isDeleted))
  }, [api])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <div className="ensemble-folder-navigator">
      <header style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <strong>文件夹</strong>
        <button type="button" aria-label="新建文件夹" onClick={() => setCreating(true)}>
          +
        </button>
      </header>
      {creating && (
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!draftName.trim()) return
            await api.createFolder({ name: draftName, parentId: null, spaceType: 'personal' })
            setCreating(false)
            setDraftName('')
            await refresh()
          }}
        >
          <input
            aria-label="文件夹名称"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
          />
        </form>
      )}
      <ul>
        {folders
          .filter((f) => f.parentId === null)
          .map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => onSelect(f)}>
                {f.name}
              </button>
              <span style={{ marginLeft: 8, fontSize: '0.85em', color: '#888' }}>
                {f.spaceType === 'personal' ? '个人' : '共享'}
              </span>
            </li>
          ))}
      </ul>
    </div>
  )
}
