import type { ApiClient } from '@ensemble-sheets/core'
import { useEffect, useState } from 'react'

export interface AdminDashboardProps {
  api: ApiClient
  /** Auto-refresh interval in ms. 0 disables. Default: 30 000. */
  refreshMs?: number
  className?: string
  style?: React.CSSProperties
}

type Stats = Awaited<ReturnType<ApiClient['adminStats']>>

export function AdminDashboard({ api, refreshMs = 30_000, className, style }: AdminDashboardProps) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)

  useEffect(() => {
    let cancelled = false
    async function tick() {
      try {
        const s = await api.adminStats()
        if (!cancelled) {
          setStats(s)
          setError(null)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setLoading(false)
        }
      }
    }
    void tick()
    if (refreshMs > 0) {
      const handle = setInterval(tick, refreshMs)
      return () => {
        cancelled = true
        clearInterval(handle)
      }
    }
    return () => {
      cancelled = true
    }
  }, [api, refreshMs])

  if (loading) return <div style={{ color: '#6b7280' }}>加载中…</div>
  if (error)
    return (
      <div role="alert" style={{ color: '#b91c1c' }}>
        加载失败：{error}
      </div>
    )
  if (!stats) return null

  return (
    <div
      className={`ensemble-admin ${className ?? ''}`}
      style={{ display: 'flex', flexDirection: 'column', gap: 16, fontSize: 13, ...style }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <Stat title="工作簿" value={stats.workbooks} />
        <Stat title="文件夹" value={stats.folders} />
        <Stat title="快照" value={stats.snapshots} />
        <Stat title="存储" value={formatBytes(stats.storageBytes)} />
        <Stat title="日活 (24h)" value={stats.activeUsers24h} />
        <Stat title="周活 (7d)" value={stats.activeUsers7d} />
        <Stat title="事件 (24h)" value={stats.events24h} />
        <Stat title="生成时刻" value={new Date(stats.generatedAt).toLocaleString()} />
      </div>

      <Section title="事件分布 (30d)">
        <BarList
          items={stats.eventsByType30d.map((e) => ({ label: e.eventType, value: e.count }))}
        />
      </Section>

      <Section title="活跃用户 (7d)">
        <BarList items={stats.topActors7d.map((t) => ({ label: t.actorId, value: t.count }))} />
      </Section>
    </div>
  )
}

function Stat({ title, value }: { title: string; value: string | number }) {
  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        padding: 12,
        background: '#fff',
      }}
    >
      <div style={{ color: '#6b7280', fontSize: 12 }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{value}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 6, color: '#374151' }}>{title}</div>
      {children}
    </div>
  )
}

function BarList({ items }: { items: Array<{ label: string; value: number }> }) {
  if (items.length === 0) return <div style={{ color: '#9ca3af' }}>暂无数据</div>
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {items.map((i) => (
        <div
          key={i.label}
          style={{
            display: 'grid',
            gridTemplateColumns: '180px 1fr 40px',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {i.label}
          </span>
          <div style={{ background: '#e5e7eb', height: 8, borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${(i.value / max) * 100}%`, height: '100%', background: '#2563eb' }} />
          </div>
          <span style={{ textAlign: 'right', color: '#6b7280' }}>{i.value}</span>
        </div>
      ))}
    </div>
  )
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
