import type { ApiClient, Version } from '@ensemble-sheets/core'
import { type CSSProperties, type FormEvent, useCallback, useEffect, useState } from 'react'

export interface VersionHistoryPanelProps {
  api: Pick<ApiClient, 'listVersions' | 'createVersion' | 'restoreVersion'>
  workbookId: string
  onRestore?: (restored: Version) => void
  onSaved?: (created: Version) => void
}

function defaultVersionName(): string {
  const now = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
    now.getHours(),
  )}:${pad(now.getMinutes())}`
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
  fontSize: 12,
  padding: '2px 8px',
  color: '#6b7280',
  borderRadius: 3,
}

const primaryBtn: CSSProperties = {
  background: '#2563eb',
  color: '#fff',
  border: '1px solid #2563eb',
  borderRadius: 4,
  padding: '4px 12px',
  fontSize: 12,
  cursor: 'pointer',
}

export function VersionHistoryPanel({
  api,
  workbookId,
  onRestore,
  onSaved,
}: VersionHistoryPanelProps) {
  const [items, setItems] = useState<Version[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { items: page } = await api.listVersions(workbookId)
      setItems(page)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [api, workbookId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    const name = draftName.trim()
    if (!name) return
    setBusy('create')
    try {
      const v = await api.createVersion(workbookId, name)
      setCreating(false)
      setDraftName('')
      onSaved?.(v)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  async function handleRestore(v: Version) {
    setBusy(`restore:${v.id}`)
    try {
      await api.restoreVersion(workbookId, v.id)
      onRestore?.(v)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="ensemble-version-history" style={{ fontSize: 13 }}>
      <header
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          padding: '4px 0',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        <strong>命名版本</strong>
        <button
          type="button"
          aria-label="保存版本"
          onClick={() => {
            setDraftName(defaultVersionName())
            setCreating(true)
          }}
          style={{ ...iconBtn, marginLeft: 'auto' }}
        >
          + 保存版本
        </button>
      </header>

      {creating && (
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 6, padding: '8px 0' }}>
          <input
            autoFocus
            aria-label="版本名称"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="例：v1 / 上线前 / 季度归档"
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
            disabled={busy === 'create' || !draftName.trim()}
            style={{ ...primaryBtn, opacity: busy === 'create' ? 0.55 : 1 }}
          >
            {busy === 'create' ? '保存中…' : '保存'}
          </button>
          <button
            type="button"
            onClick={() => {
              setCreating(false)
              setDraftName('')
            }}
            style={iconBtn}
          >
            取消
          </button>
        </form>
      )}

      {error && (
        <div role="alert" style={{ color: '#b91c1c', fontSize: 12, padding: '6px 0' }}>
          错误：{error}{' '}
          <button type="button" onClick={() => void refresh()} style={iconBtn}>
            重试
          </button>
        </div>
      )}

      {loading && <div style={{ padding: '12px 0', color: '#9ca3af', fontSize: 12 }}>加载中…</div>}

      {!loading && items.length === 0 && (
        <div
          style={{ padding: '14px 0', color: '#9ca3af', fontSize: 12, textAlign: 'center' }}
        >
          暂无命名版本。点 + 保存版本 开始。
        </div>
      )}

      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {items.map((v) => (
          <li
            key={v.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 4px',
              borderBottom: '1px solid #f3f4f6',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: '#1f2937', fontWeight: 500 }}>{v.name}</div>
              <div style={{ color: '#9ca3af', fontSize: 11 }}>
                {v.createdBy} · {relTime(v.createdAt)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleRestore(v)}
              disabled={busy === `restore:${v.id}`}
              title={`恢复到「${v.name}」（当前编辑会另存为新版本）`}
              style={{ ...iconBtn, color: '#0369a1' }}
            >
              {busy === `restore:${v.id}` ? '恢复中…' : '恢复'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
