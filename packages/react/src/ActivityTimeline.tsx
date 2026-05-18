import type { ActivityEntry, ApiClient } from '@ensemble-sheets/core'
import { type CSSProperties, useCallback, useEffect, useState } from 'react'

export interface ActivityTimelineProps {
  api: Pick<ApiClient, 'listActivity'>
  workbookId: string
  limit?: number
  style?: CSSProperties
}

const eventLabel: Record<string, { icon: string; label: string }> = {
  'workbook.created': { icon: '🆕', label: '创建工作簿' },
  'workbook.opened': { icon: '👁', label: '打开' },
  'workbook.edited': { icon: '✎', label: '编辑' },
  'workbook.deleted': { icon: '🗑', label: '删除工作簿' },
  'workbook.moved': { icon: '➡', label: '移动工作簿' },
  'folder.created': { icon: '📁', label: '创建文件夹' },
  'folder.renamed': { icon: '✎', label: '重命名文件夹' },
  'folder.moved': { icon: '➡', label: '移动文件夹' },
  'folder.deleted': { icon: '🗑', label: '删除文件夹' },
  'folder.restored': { icon: '↩', label: '恢复文件夹' },
  'share.granted': { icon: '↗', label: '授予分享权限' },
  'share.revoked': { icon: '↙', label: '撤销分享权限' },
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
  padding: '2px 6px',
  color: '#6b7280',
  borderRadius: 3,
  marginLeft: 'auto',
}

export function ActivityTimeline({ api, workbookId, limit = 50, style }: ActivityTimelineProps) {
  const [items, setItems] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)

  const fetchPage = useCallback(
    async (before?: string) => {
      const { items: page } = await api.listActivity(workbookId, {
        limit,
        ...(before ? { before } : {}),
      })
      return page
    },
    [api, workbookId, limit],
  )

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const page = await fetchPage()
      setItems(page)
      setHasMore(page.length === limit)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [fetchPage, limit])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function loadMore() {
    if (items.length === 0 || loadingMore) return
    setLoadingMore(true)
    try {
      const cursor = items[items.length - 1]?.occurredAt
      const page = await fetchPage(cursor)
      setItems((prev) => [...prev, ...page])
      setHasMore(page.length === limit)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div style={{ fontSize: 13, ...style }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 0',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        <strong>协作历史</strong>
        <button
          type="button"
          onClick={() => void refresh()}
          aria-label="刷新协作历史"
          style={iconBtn}
        >
          ⟳
        </button>
      </header>

      {error && (
        <div role="alert" style={{ color: '#b91c1c', fontSize: 12, padding: '8px 0' }}>
          错误：{error}{' '}
          <button type="button" onClick={() => void refresh()} style={iconBtn}>
            重试
          </button>
        </div>
      )}

      {loading && <div style={{ padding: '12px 0', color: '#9ca3af', fontSize: 12 }}>加载中…</div>}

      {!loading && items.length === 0 && (
        <div
          style={{
            padding: '12px 0',
            color: '#9ca3af',
            fontSize: 12,
            textAlign: 'center',
          }}
        >
          暂无活动记录
        </div>
      )}

      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {items.map((ev) => {
          const meta = eventLabel[ev.eventType] ?? { icon: '·', label: ev.eventType }
          return (
            <li
              key={ev.id}
              style={{
                display: 'flex',
                gap: 10,
                padding: '8px 4px',
                borderBottom: '1px solid #f3f4f6',
                fontSize: 12,
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>
                {meta.icon}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#1f2937' }}>
                  <strong>{ev.actorId}</strong>
                  <span style={{ color: '#6b7280' }}> · {meta.label}</span>
                </div>
                {Object.keys(ev.payload).length > 0 && (
                  <pre
                    style={{
                      margin: '4px 0 0',
                      padding: 6,
                      background: '#f9fafb',
                      borderRadius: 4,
                      fontSize: 11,
                      overflow: 'auto',
                      maxHeight: 80,
                    }}
                  >
                    {JSON.stringify(ev.payload, null, 0)}
                  </pre>
                )}
                <span style={{ color: '#9ca3af', fontSize: 11 }}>{relTime(ev.occurredAt)}</span>
              </div>
            </li>
          )
        })}
      </ul>

      {hasMore && (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          style={{
            width: '100%',
            padding: '8px 0',
            background: 'transparent',
            border: 'none',
            borderTop: '1px solid #f3f4f6',
            cursor: loadingMore ? 'wait' : 'pointer',
            color: '#6b7280',
            fontSize: 12,
          }}
        >
          {loadingMore ? '加载中…' : '加载更多'}
        </button>
      )}
    </div>
  )
}
