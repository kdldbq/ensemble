import type { ApiClient, Folder } from '@ensemble-sheets/core'
import { useCallback, useEffect, useState } from 'react'

export interface FolderNavigatorProps {
  api: Pick<
    ApiClient,
    'listFolders' | 'createFolder' | 'renameFolder' | 'moveFolder' | 'deleteFolder'
  >
  onSelect: (folder: Folder) => void
  /**
   * When false, mutating actions (create / rename / move / delete) are hidden;
   * the panel becomes a read-only browse view. Defaults to true.
   */
  canEdit?: boolean
}

export function FolderNavigator({ api, onSelect, canEdit = true }: FolderNavigatorProps) {
  const [folders, setFolders] = useState<Folder[]>([])
  const [creating, setCreating] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [movingId, setMovingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const { items } = await api.listFolders()
    setFolders(items.filter((f) => !f.isDeleted))
  }, [api])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function runMutation(fn: () => Promise<unknown>) {
    try {
      setError(null)
      await fn()
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const rootFolders = folders.filter((f) => f.parentId === null)

  return (
    <div className="ensemble-folder-navigator">
      <header style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <strong>文件夹</strong>
        {canEdit && (
          <button type="button" aria-label="新建文件夹" onClick={() => setCreating(true)}>
            +
          </button>
        )}
      </header>

      {error && (
        <div style={{ color: '#b91c1c', fontSize: 12, padding: '4px 0' }}>错误：{error}</div>
      )}

      {canEdit && creating && (
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!draftName.trim()) return
            await runMutation(() =>
              api.createFolder({ name: draftName.trim(), parentId: null, spaceType: 'personal' }),
            )
            setCreating(false)
            setDraftName('')
          }}
          style={{ marginTop: 6, display: 'flex', gap: 6 }}
        >
          <input
            aria-label="文件夹名称"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="新文件夹"
          />
          <button type="submit">保存</button>
          <button
            type="button"
            onClick={() => {
              setCreating(false)
              setDraftName('')
            }}
          >
            取消
          </button>
        </form>
      )}

      <ul style={{ listStyle: 'none', padding: 0, marginTop: 8 }}>
        {rootFolders.map((f) => {
          const isRenaming = renamingId === f.id
          const isMoving = movingId === f.id
          const moveTargets = folders.filter((other) => other.id !== f.id)
          return (
            <li
              key={f.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 0',
                borderBottom: '1px solid #f3f4f6',
              }}
            >
              {isRenaming ? (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault()
                    const trimmed = renameDraft.trim()
                    if (trimmed && trimmed !== f.name) {
                      await runMutation(() => api.renameFolder(f.id, trimmed))
                    }
                    setRenamingId(null)
                    setRenameDraft('')
                  }}
                  style={{ flex: 1, display: 'flex', gap: 4 }}
                >
                  <input
                    aria-label={`重命名 ${f.name}`}
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                  />
                  <button type="submit">确认</button>
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingId(null)
                      setRenameDraft('')
                    }}
                  >
                    取消
                  </button>
                </form>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onSelect(f)}
                    style={{
                      flex: 1,
                      textAlign: 'left',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px 6px',
                    }}
                  >
                    {f.name}
                    <span style={{ marginLeft: 8, fontSize: '0.85em', color: '#888' }}>
                      {f.spaceType === 'personal' ? '个人' : '共享'}
                    </span>
                  </button>
                  {canEdit && !isMoving && (
                    <span style={{ display: 'inline-flex', gap: 2 }}>
                      <button
                        type="button"
                        aria-label={`重命名 ${f.name}`}
                        title="重命名"
                        onClick={() => {
                          setRenamingId(f.id)
                          setRenameDraft(f.name)
                        }}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        aria-label={`移动 ${f.name}`}
                        title="移动到..."
                        onClick={() => setMovingId(f.id)}
                      >
                        ⇨
                      </button>
                      <button
                        type="button"
                        aria-label={`删除 ${f.name}`}
                        title="删除"
                        onClick={async () => {
                          if (!confirm(`确认删除「${f.name}」？此操作不可撤销。`)) return
                          await runMutation(() => api.deleteFolder(f.id))
                        }}
                      >
                        🗑
                      </button>
                    </span>
                  )}
                </>
              )}

              {isMoving && (
                <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                  <select
                    aria-label={`将 ${f.name} 移动到`}
                    defaultValue=""
                    onChange={async (e) => {
                      const v = e.target.value
                      if (v === '') return
                      const newParent = v === '__root__' ? null : v
                      if (newParent === f.parentId) {
                        setMovingId(null)
                        return
                      }
                      await runMutation(() => api.moveFolder(f.id, newParent))
                      setMovingId(null)
                    }}
                  >
                    <option value="" disabled>
                      选择目标
                    </option>
                    <option value="__root__">根目录</option>
                    {moveTargets.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => setMovingId(null)}>
                    取消
                  </button>
                </span>
              )}
            </li>
          )
        })}
        {rootFolders.length === 0 && (
          <li style={{ fontSize: 12, color: '#9ca3af', padding: '6px 0' }}>暂无文件夹</li>
        )}
      </ul>
    </div>
  )
}
