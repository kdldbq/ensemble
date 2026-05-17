import {
  type ApiClient,
  buildFolderTree,
  type Folder,
  type FolderTreeNode,
} from '@ensemble-sheets/core'
import {
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

export interface FolderTreeProps {
  api: Pick<
    ApiClient,
    | 'listFolders'
    | 'createFolder'
    | 'renameFolder'
    | 'moveFolder'
    | 'deleteFolder'
    | 'restoreFolder'
    | 'reorderFolder'
    | 'listTrashedFolders'
  >
  storageKey?: string
  canEdit?: boolean
  onSelect?: (folder: Folder) => void
  selectedId?: string | null
}

const EXPAND_STORAGE_PREFIX = 'ensemble:folder-tree:expanded:'

function useExpanded(storageKey: string) {
  const fullKey = `${EXPAND_STORAGE_PREFIX}${storageKey}`
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const raw = window.localStorage.getItem(fullKey)
      if (raw) return new Set(JSON.parse(raw) as string[])
    } catch {
      /* ignore */
    }
    return new Set()
  })

  const persist = useCallback(
    (s: Set<string>) => {
      if (typeof window === 'undefined') return
      try {
        window.localStorage.setItem(fullKey, JSON.stringify([...s]))
      } catch {
        /* ignore quota */
      }
    },
    [fullKey],
  )

  const toggle = useCallback(
    (id: string) =>
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        persist(next)
        return next
      }),
    [persist],
  )

  const expandAll = useCallback(
    (ids: string[]) =>
      setExpanded((prev) => {
        const next = new Set(prev)
        for (const id of ids) next.add(id)
        persist(next)
        return next
      }),
    [persist],
  )

  return { expanded, toggle, expandAll }
}

function findPath(tree: FolderTreeNode[], targetId: string): FolderTreeNode[] {
  for (const node of tree) {
    if (node.id === targetId) return [node]
    const sub = findPath(node.children, targetId)
    if (sub.length) return [node, ...sub]
  }
  return []
}

function ancestorIdsOf(tree: FolderTreeNode[], targetId: string): string[] {
  return findPath(tree, targetId)
    .slice(0, -1)
    .map((n) => n.id)
}

function hasMatchedDescendant(node: FolderTreeNode, matched: Set<string>): boolean {
  for (const c of node.children) {
    if (matched.has(c.id)) return true
    if (hasMatchedDescendant(c, matched)) return true
  }
  return false
}

interface NodeProps {
  node: FolderTreeNode
  expanded: Set<string>
  onToggle: (id: string) => void
  onSelect: ((folder: Folder) => void) | undefined
  selectedId: string | null | undefined
  renamingId: string | null
  setRenamingId: (id: string | null) => void
  renameDraft: string
  setRenameDraft: (s: string) => void
  canEdit: boolean
  matchedIds: Set<string> | null
  onCommitRename: (id: string, newName: string) => void | Promise<void>
  onDelete: (folder: FolderTreeNode) => void | Promise<void>
  onAddChild: (parent: FolderTreeNode) => void
}

function FolderNode({
  node,
  expanded,
  onToggle,
  onSelect,
  selectedId,
  renamingId,
  setRenamingId,
  renameDraft,
  setRenameDraft,
  canEdit,
  matchedIds,
  onCommitRename,
  onDelete,
  onAddChild,
}: NodeProps) {
  const hasChildren = node.children.length > 0
  const isOpen = expanded.has(node.id)
  const isSelected = selectedId === node.id
  const isRenaming = renamingId === node.id
  const isMatched = matchedIds === null || matchedIds.has(node.id)

  const filteredChildren =
    matchedIds === null
      ? node.children
      : node.children.filter(
          (c) => matchedIds.has(c.id) || hasMatchedDescendant(c, matchedIds),
        )

  if (matchedIds !== null && !isMatched && filteredChildren.length === 0) return null

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowRight' && hasChildren && !isOpen) {
      onToggle(node.id)
      e.preventDefault()
    } else if (e.key === 'ArrowLeft' && hasChildren && isOpen) {
      onToggle(node.id)
      e.preventDefault()
    } else if (e.key === 'Enter' && onSelect) {
      onSelect(node)
      e.preventDefault()
    } else if (e.key === 'F2' && canEdit) {
      setRenamingId(node.id)
      setRenameDraft(node.name)
      e.preventDefault()
    } else if (e.key === 'Delete' && canEdit) {
      void onDelete(node)
      e.preventDefault()
    }
  }

  return (
    <li role="treeitem" aria-expanded={hasChildren ? isOpen : undefined}>
      <div
        tabIndex={0}
        onKeyDown={handleKeyDown}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 6px',
          paddingLeft: 6 + node.depth * 16,
          background: isSelected ? '#e0e7ff' : 'transparent',
          borderRadius: 4,
          fontSize: 13,
        }}
      >
        <button
          type="button"
          aria-label={isOpen ? `collapse ${node.name}` : `expand ${node.name}`}
          onClick={() => hasChildren && onToggle(node.id)}
          style={{
            width: 16,
            border: 'none',
            background: 'transparent',
            cursor: hasChildren ? 'pointer' : 'default',
            color: '#6b7280',
            fontSize: 10,
            opacity: hasChildren ? 1 : 0,
          }}
        >
          {isOpen ? '▼' : '▶'}
        </button>

        <span style={{ marginRight: 4 }}>📁</span>

        {isRenaming ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void onCommitRename(node.id, renameDraft)
            }}
            style={{ flex: 1, display: 'flex', gap: 4 }}
          >
            <input
              autoFocus
              aria-label={`rename ${node.name}`}
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setRenamingId(null)
                  setRenameDraft('')
                }
              }}
              onBlur={() => {
                void onCommitRename(node.id, renameDraft)
              }}
              style={{ flex: 1, fontSize: 13, padding: '2px 4px' }}
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={() => onSelect?.(node)}
            onDoubleClick={() => hasChildren && onToggle(node.id)}
            style={{
              flex: 1,
              textAlign: 'left',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              fontSize: 13,
              fontWeight: isSelected ? 600 : 400,
            }}
          >
            {node.name}
            <span style={{ marginLeft: 6, fontSize: 11, color: '#9ca3af' }}>
              {node.spaceType === 'personal' ? '私人' : '共享'}
            </span>
          </button>
        )}

        {canEdit && !isRenaming && (
          <span style={{ display: 'inline-flex', gap: 2 }}>
            <button
              type="button"
              aria-label={`new subfolder in ${node.name}`}
              title="新建子文件夹"
              onClick={() => onAddChild(node)}
              style={iconBtn}
            >
              +
            </button>
            <button
              type="button"
              aria-label={`rename ${node.name}`}
              title="重命名 (F2)"
              onClick={() => {
                setRenamingId(node.id)
                setRenameDraft(node.name)
              }}
              style={iconBtn}
            >
              ✎
            </button>
            <button
              type="button"
              aria-label={`delete ${node.name}`}
              title="删除 (Delete)"
              onClick={() => void onDelete(node)}
              style={iconBtn}
            >
              🗑
            </button>
          </span>
        )}
      </div>

      {hasChildren && isOpen && filteredChildren.length > 0 && (
        <ul role="group" style={listStyle}>
          {filteredChildren.map((c) => (
            <FolderNode
              key={c.id}
              node={c}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              selectedId={selectedId}
              renamingId={renamingId}
              setRenamingId={setRenamingId}
              renameDraft={renameDraft}
              setRenameDraft={setRenameDraft}
              canEdit={canEdit}
              matchedIds={matchedIds}
              onCommitRename={onCommitRename}
              onDelete={onDelete}
              onAddChild={onAddChild}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

const iconBtn: CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: 12,
  padding: '2px 4px',
  color: '#6b7280',
  borderRadius: 3,
}

const listStyle: CSSProperties = { listStyle: 'none', padding: 0, margin: 0 }

const breadcrumbBtn: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#6b7280',
  cursor: 'pointer',
  padding: 0,
  fontSize: 11,
}

const emptyStyle: CSSProperties = {
  padding: '12px 0',
  color: '#9ca3af',
  fontSize: 12,
  textAlign: 'center',
}

function tabBtnStyle(active: boolean): CSSProperties {
  return {
    border: 'none',
    background: active ? '#e0e7ff' : 'transparent',
    color: active ? '#1e40af' : '#6b7280',
    padding: '2px 8px',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 11,
  }
}

export function FolderTree({
  api,
  storageKey = 'default',
  canEdit = true,
  onSelect,
  selectedId,
}: FolderTreeProps) {
  const [folders, setFolders] = useState<Folder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [trashView, setTrashView] = useState(false)
  const [trashed, setTrashed] = useState<Folder[]>([])
  const [creating, setCreating] = useState<{ parentId: string | null } | null>(null)
  const [draftName, setDraftName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  const { expanded, toggle, expandAll } = useExpanded(storageKey)
  const treeContainerRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (trashView) {
        const { items } = await api.listTrashedFolders()
        setTrashed(items)
      } else {
        const { items } = await api.listFolders()
        setFolders(items.filter((f) => !f.isDeleted))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [api, trashView])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const tree = useMemo(() => buildFolderTree(folders), [folders])

  useEffect(() => {
    if (selectedId) {
      const ancestors = ancestorIdsOf(tree, selectedId)
      if (ancestors.length) expandAll(ancestors)
    }
  }, [selectedId, tree, expandAll])

  const matchedIds = useMemo<Set<string> | null>(() => {
    const q = query.trim().toLowerCase()
    if (q === '') return null
    const matched = new Set<string>()
    for (const f of folders) {
      if (f.name.toLowerCase().includes(q)) matched.add(f.id)
    }
    return matched
  }, [query, folders])

  async function runMutation<T>(fn: () => Promise<T>): Promise<T | null> {
    try {
      setError(null)
      const result = await fn()
      await refresh()
      return result
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return null
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!creating || !draftName.trim()) return
    const parentId = creating.parentId
    await runMutation(() =>
      api.createFolder({
        name: draftName.trim(),
        parentId,
        spaceType: 'personal',
      }),
    )
    setCreating(null)
    setDraftName('')
    if (parentId) expandAll([parentId])
  }

  async function handleCommitRename(id: string, newName: string) {
    const trimmed = newName.trim()
    setRenamingId(null)
    setRenameDraft('')
    if (!trimmed) return
    const existing = folders.find((f) => f.id === id)
    if (existing && trimmed === existing.name) return
    await runMutation(() => api.renameFolder(id, trimmed))
  }

  async function handleDelete(folder: FolderTreeNode) {
    if (!window.confirm(`确认删除「${folder.name}」？可在回收站恢复。`)) return
    await runMutation(() => api.deleteFolder(folder.id))
  }

  async function handleRestore(folder: Folder) {
    await runMutation(() => api.restoreFolder(folder.id))
  }

  const path = useMemo(
    () => (selectedId ? findPath(tree, selectedId) : []),
    [tree, selectedId],
  )

  return (
    <div className="ensemble-folder-tree" style={{ fontSize: 13 }} ref={treeContainerRef}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 0',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        <strong>文件夹</strong>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={() => setTrashView(false)}
            aria-pressed={!trashView}
            style={tabBtnStyle(!trashView)}
          >
            活跃
          </button>
          <button
            type="button"
            onClick={() => setTrashView(true)}
            aria-pressed={trashView}
            style={tabBtnStyle(trashView)}
          >
            回收站
          </button>
        </div>
      </header>

      {!trashView && (
        <div style={{ padding: '6px 0', display: 'flex', gap: 6 }}>
          <input
            type="search"
            placeholder="搜索文件夹…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: 1, fontSize: 13, padding: '4px 8px' }}
          />
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setCreating({ parentId: null })
                setDraftName('')
              }}
              title="新建根目录文件夹"
              style={iconBtn}
            >
              + 新建
            </button>
          )}
        </div>
      )}

      {path.length > 0 && (
        <nav
          aria-label="文件夹路径"
          style={{ fontSize: 11, color: '#6b7280', padding: '4px 0' }}
        >
          <button
            type="button"
            onClick={() => onSelect?.({ id: '', name: 'root' } as Folder)}
            style={breadcrumbBtn}
          >
            根
          </button>
          {path.map((p) => (
            <span key={p.id}>
              <span style={{ margin: '0 4px' }}>/</span>
              <button type="button" onClick={() => onSelect?.(p)} style={breadcrumbBtn}>
                {p.name}
              </button>
            </span>
          ))}
        </nav>
      )}

      {error && (
        <div role="alert" style={{ color: '#b91c1c', fontSize: 12, padding: '4px 0' }}>
          错误：{error}{' '}
          <button type="button" onClick={() => void refresh()} style={iconBtn}>
            重试
          </button>
        </div>
      )}

      {loading && (
        <div style={{ padding: '12px 0', color: '#9ca3af', fontSize: 12 }}>加载中…</div>
      )}

      {creating && !trashView && (
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 6, padding: '4px 0' }}>
          <input
            autoFocus
            aria-label="新文件夹名称"
            placeholder={creating.parentId ? '新建子文件夹' : '新建根文件夹'}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
          />
          <button type="submit">保存</button>
          <button
            type="button"
            onClick={() => {
              setCreating(null)
              setDraftName('')
            }}
          >
            取消
          </button>
        </form>
      )}

      {!loading && !trashView && tree.length === 0 && !creating && (
        <div style={emptyStyle}>暂无文件夹{canEdit && '，点 + 新建开始'}</div>
      )}

      {!trashView && tree.length > 0 && (
        <ul role="tree" aria-label="文件夹树" style={listStyle}>
          {tree.map((node) => (
            <FolderNode
              key={node.id}
              node={node}
              expanded={expanded}
              onToggle={toggle}
              onSelect={onSelect}
              selectedId={selectedId}
              renamingId={renamingId}
              setRenamingId={setRenamingId}
              renameDraft={renameDraft}
              setRenameDraft={setRenameDraft}
              canEdit={canEdit}
              matchedIds={matchedIds}
              onCommitRename={handleCommitRename}
              onDelete={handleDelete}
              onAddChild={(parent) => {
                setCreating({ parentId: parent.id })
                setDraftName('')
                expandAll([parent.id])
              }}
            />
          ))}
        </ul>
      )}

      {trashView && (
        <>
          {!loading && trashed.length === 0 && <div style={emptyStyle}>回收站为空</div>}
          <ul style={listStyle}>
            {trashed.map((f) => (
              <li
                key={f.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 6px',
                  fontSize: 13,
                  borderBottom: '1px solid #f3f4f6',
                }}
              >
                <span style={{ flex: 1 }}>
                  📁 {f.name}{' '}
                  {f.deletedAt && (
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>
                      ({new Date(f.deletedAt).toLocaleString('zh-CN')})
                    </span>
                  )}
                </span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => void handleRestore(f)}
                    style={{ ...iconBtn, color: '#0369a1' }}
                  >
                    恢复
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
