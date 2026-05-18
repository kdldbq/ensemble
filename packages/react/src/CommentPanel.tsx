import type { ApiClient, Comment } from '@ensemble-sheets/core'
import { type CSSProperties, type FormEvent, useCallback, useEffect, useState } from 'react'

export interface CommentPanelProps {
  api: Pick<ApiClient, 'listComments' | 'createComment' | 'updateComment' | 'deleteComment'>
  workbookId: string
  currentUserId: string
  readOnly?: boolean
  showResolved?: boolean
  style?: CSSProperties
}

interface ThreadBucket {
  threadId: string
  rootCell: string | null
  comments: Comment[]
  resolved: boolean
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return '刚刚'
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} 分钟前`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)} 小时前`
  if (ms < 7 * 86_400_000) return `${Math.floor(ms / 86_400_000)} 天前`
  return new Date(iso).toLocaleString('zh-CN')
}

const iconBtn: CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: 11,
  padding: '2px 8px',
  color: '#6b7280',
  borderRadius: 3,
}

function bucketize(items: Comment[]): ThreadBucket[] {
  const map = new Map<string, ThreadBucket>()
  for (const c of items) {
    let b = map.get(c.threadId)
    if (!b) {
      b = { threadId: c.threadId, rootCell: c.cellRef, comments: [], resolved: false }
      map.set(c.threadId, b)
    }
    b.comments.push(c)
    if (c.resolved) b.resolved = true
  }
  for (const b of map.values()) {
    b.comments.sort((x, y) => x.createdAt.localeCompare(y.createdAt))
    const root = b.comments.find((c) => c.parentId === null)
    b.rootCell = root?.cellRef ?? b.rootCell
  }
  return Array.from(map.values()).sort((a, b) =>
    (b.comments[0]?.createdAt ?? '').localeCompare(a.comments[0]?.createdAt ?? ''),
  )
}

export function CommentPanel({
  api,
  workbookId,
  currentUserId,
  readOnly = false,
  showResolved = false,
  style,
}: CommentPanelProps) {
  const [items, setItems] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [includeResolved, setIncludeResolved] = useState(showResolved)
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({})
  const [newDraft, setNewDraft] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { items: page } = await api.listComments(workbookId, { includeResolved })
      setItems(page)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [api, workbookId, includeResolved])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function handleCreateRoot(e: FormEvent) {
    e.preventDefault()
    const body = newDraft.trim()
    if (!body) return
    setBusy('create-root')
    try {
      const threadId = `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      await api.createComment(workbookId, { threadId, body, cellRef: null, parentId: null })
      setNewDraft('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  async function handleReply(thread: ThreadBucket) {
    const body = replyDraft[thread.threadId]?.trim()
    if (!body) return
    setBusy(`reply:${thread.threadId}`)
    try {
      const root = thread.comments.find((c) => c.parentId === null) ?? thread.comments[0]
      await api.createComment(workbookId, {
        threadId: thread.threadId,
        body,
        cellRef: thread.rootCell ?? null,
        parentId: root?.id ?? null,
      })
      setReplyDraft((prev) => ({ ...prev, [thread.threadId]: '' }))
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  async function handleToggleResolved(thread: ThreadBucket) {
    const root = thread.comments.find((c) => c.parentId === null) ?? thread.comments[0]
    if (!root) return
    setBusy(`resolve:${thread.threadId}`)
    try {
      await api.updateComment(workbookId, root.id, { resolved: !thread.resolved })
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  async function handleDeleteComment(c: Comment) {
    setBusy(`delete:${c.id}`)
    try {
      await api.deleteComment(workbookId, c.id)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const buckets = bucketize(items)

  return (
    <div className="ensemble-comment-panel" style={{ fontSize: 13, ...style }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 0',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        <strong>评论</strong>
        <label
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            color: '#6b7280',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <input
            type="checkbox"
            checked={includeResolved}
            onChange={(e) => setIncludeResolved(e.target.checked)}
          />
          含已解决
        </label>
        <button type="button" onClick={() => void refresh()} aria-label="刷新评论" style={iconBtn}>
          ⟳
        </button>
      </header>

      {error && (
        <div role="alert" style={{ color: '#b91c1c', fontSize: 12, padding: '6px 0' }}>
          错误：{error}
        </div>
      )}

      {!readOnly && (
        <form onSubmit={handleCreateRoot} style={{ display: 'flex', gap: 6, padding: '8px 0' }}>
          <input
            value={newDraft}
            onChange={(e) => setNewDraft(e.target.value)}
            placeholder="发起新评论…  @userId 提及他人"
            style={{
              flex: 1,
              fontSize: 13,
              padding: '4px 8px',
              border: '1px solid #d1d5db',
              borderRadius: 4,
            }}
          />
          <button
            type="submit"
            disabled={!newDraft.trim() || busy === 'create-root'}
            style={{
              background: '#2563eb',
              color: '#fff',
              border: '1px solid #2563eb',
              borderRadius: 4,
              padding: '4px 12px',
              fontSize: 12,
              cursor: 'pointer',
              opacity: !newDraft.trim() || busy === 'create-root' ? 0.55 : 1,
            }}
          >
            {busy === 'create-root' ? '发布中…' : '发布'}
          </button>
        </form>
      )}

      {loading && <div style={{ padding: '12px 0', color: '#9ca3af', fontSize: 12 }}>加载中…</div>}

      {!loading && buckets.length === 0 && (
        <div style={{ padding: '14px 0', color: '#9ca3af', fontSize: 12, textAlign: 'center' }}>
          暂无评论
        </div>
      )}

      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {buckets.map((thread) => {
          const root = thread.comments.find((c) => c.parentId === null) ?? thread.comments[0]
          return (
            <li
              key={thread.threadId}
              style={{
                padding: '10px 0',
                borderBottom: '1px solid #f3f4f6',
                opacity: thread.resolved ? 0.6 : 1,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                <strong style={{ fontSize: 12 }}>{root?.authorId}</strong>
                {thread.rootCell && (
                  <span style={{ fontSize: 11, color: '#6b7280' }}>@ {thread.rootCell}</span>
                )}
                {root && (
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>
                    · {relTime(root.createdAt)}
                  </span>
                )}
                {thread.resolved && (
                  <span
                    style={{
                      fontSize: 10,
                      background: '#dcfce7',
                      color: '#15803d',
                      padding: '1px 6px',
                      borderRadius: 4,
                      marginLeft: 'auto',
                    }}
                  >
                    已解决
                  </span>
                )}
              </div>

              {thread.comments.map((c) => (
                <div
                  key={c.id}
                  style={{
                    paddingLeft: c.parentId === null ? 0 : 16,
                    paddingTop: c.parentId === null ? 0 : 6,
                    color: '#1f2937',
                    fontSize: 13,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {c.parentId !== null && (
                    <div style={{ fontSize: 11, color: '#6b7280' }}>
                      ↳ {c.authorId} · {relTime(c.createdAt)}
                    </div>
                  )}
                  <div>{c.body}</div>
                  {c.mentions.length > 0 && (
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                      @ 提及：{c.mentions.join(', ')}
                    </div>
                  )}
                  {!readOnly && c.authorId === currentUserId && (
                    <button
                      type="button"
                      onClick={() => void handleDeleteComment(c)}
                      style={{ ...iconBtn, color: '#dc2626', fontSize: 10 }}
                    >
                      删除
                    </button>
                  )}
                </div>
              ))}

              {!readOnly && !thread.resolved && (
                <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                  <input
                    value={replyDraft[thread.threadId] ?? ''}
                    onChange={(e) =>
                      setReplyDraft((prev) => ({
                        ...prev,
                        [thread.threadId]: e.target.value,
                      }))
                    }
                    placeholder="回复…"
                    style={{
                      flex: 1,
                      fontSize: 12,
                      padding: '3px 6px',
                      border: '1px solid #e5e7eb',
                      borderRadius: 4,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void handleReply(thread)}
                    disabled={
                      !replyDraft[thread.threadId]?.trim() || busy === `reply:${thread.threadId}`
                    }
                    style={{ ...iconBtn, color: '#2563eb' }}
                  >
                    回复
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleToggleResolved(thread)}
                    style={{ ...iconBtn, color: '#15803d' }}
                  >
                    {busy === `resolve:${thread.threadId}` ? '…' : '解决'}
                  </button>
                </div>
              )}

              {!readOnly && thread.resolved && (
                <button
                  type="button"
                  onClick={() => void handleToggleResolved(thread)}
                  style={{ ...iconBtn, marginTop: 6 }}
                >
                  重新打开
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
