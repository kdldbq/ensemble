// biome-ignore-all lint/suspicious/noArrayIndexKey: rows render once from a frozen snapshot; reordering is not possible at this layer.
import type { UniverWorkbookData } from '@ensemble-sheets/core'
import { useEffect, useRef, useState } from 'react'

export interface ViewerPreviewProps {
  workbookId: string
  /** Bumped to force-refresh after a Save / restore. */
  refreshKey: number
}

const VIEWER_TOKEN = 'dev:viewer-demo-preview'
const POLL_MS = 3000

/**
 * Static HTML rendering of the workbook snapshot fetched with a viewer-persona token.
 * Shows visitors what a permissioned colleague sees — column B comes back as ***
 * because the server applies mask rules on every snapshot egress.
 *
 * Why static HTML instead of a second Univer instance: Univer 0.22 keeps global
 * keyboard / shortcut singletons per page; mounting two Univer instances breaks
 * keystrokes in both. A static table is enough for "see what they see".
 */
export function ViewerPreview({ workbookId, refreshKey }: ViewerPreviewProps) {
  const [data, setData] = useState<UniverWorkbookData | null>(null)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let cancelled = false
    // refreshKey is read into the effect's scope only to make it a dependency —
    // bumping it remounts the effect (which re-fetches immediately).
    void refreshKey
    async function fetchSnapshot() {
      try {
        const res = await fetch(`/api/v1/workbooks/${workbookId}/snapshot`, {
          headers: { Authorization: `Bearer ${VIEWER_TOKEN}` },
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        if (res.status === 204) {
          if (!cancelled) setData(null)
          return
        }
        const json = (await res.json()) as UniverWorkbookData
        if (!cancelled) {
          setData(json)
          setUpdatedAt(Date.now())
          setError(null)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    }
    void fetchSnapshot()
    tickRef.current = setInterval(fetchSnapshot, POLL_MS)
    return () => {
      cancelled = true
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [workbookId, refreshKey])

  const sheet = data ? data.sheets[data.sheetOrder[0] ?? ''] : null
  const rows = sheet ? extractRows(sheet.cellData) : []

  return (
    <aside
      style={{
        width: 360,
        borderLeft: '1px solid #e5e7eb',
        background: '#faf5ff',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <header
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid #e5e7eb',
          fontSize: 12,
          color: '#374151',
          background: '#fff',
        }}
      >
        <div style={{ fontWeight: 600 }}>查看者眼中（B 列已脱敏）</div>
        <div style={{ color: '#9ca3af', fontSize: 11, marginTop: 2 }}>
          编辑器每 0.8 秒自动保存一次，本面板随后立即拉取最新快照
          {updatedAt && ` · 更新于 ${formatAgo(updatedAt)}`}
        </div>
      </header>

      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        {error ? (
          <div style={{ color: '#b91c1c', fontSize: 13 }}>读取失败：{error}</div>
        ) : !sheet ? (
          <div style={{ color: '#6b7280', fontSize: 13 }}>加载中…</div>
        ) : (
          <table
            style={{
              borderCollapse: 'collapse',
              fontSize: 13,
              width: '100%',
            }}
          >
            <tbody>
              {rows.map((row, rIdx) => (
                <tr
                  key={`r-${rIdx}-${row.join('|').slice(0, 40)}`}
                  style={
                    rIdx === 0
                      ? { background: '#e9d5ff', fontWeight: 600 }
                      : { background: rIdx % 2 ? '#fff' : '#f9fafb' }
                  }
                >
                  {row.map((cell, cIdx) => (
                    <td
                      key={`c-${cIdx}-${cell.slice(0, 20)}`}
                      style={{
                        padding: '4px 8px',
                        border: '1px solid #e5e7eb',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: 140,
                        color: cell === '***' ? '#9333ea' : undefined,
                        fontFamily: cell === '***' ? 'monospace' : undefined,
                      }}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </aside>
  )
}

function extractRows(cellData: Record<string, Record<string, { v?: unknown }>>): string[][] {
  const rowKeys = Object.keys(cellData)
    .map(Number)
    .sort((a, b) => a - b)
  if (rowKeys.length === 0) return []
  const maxCol = rowKeys.reduce((m, r) => {
    const row = cellData[String(r)]
    if (!row) return m
    const cols = Object.keys(row).map(Number)
    return Math.max(m, ...cols)
  }, 0)
  return rowKeys.map((r) => {
    const row = cellData[String(r)] ?? {}
    const out: string[] = []
    for (let c = 0; c <= maxCol; c++) {
      const cell = row[String(c)]
      out.push(cell?.v === undefined || cell.v === null ? '' : String(cell.v))
    }
    return out
  })
}

function formatAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return `${s} 秒前`
  const m = Math.round(s / 60)
  return `${m} 分钟前`
}
