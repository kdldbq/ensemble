// biome-ignore-all lint/suspicious/noArrayIndexKey: chart legend/axis lists are derived once per render from immutable arrays; key collision is impossible.
import type { ChartData, ChartKind } from '@ensemble-sheets/core'

export interface ChartPanelProps {
  data: ChartData
  kind: ChartKind
  title?: string
  width?: number
  height?: number
}

const PALETTE = ['#2563eb', '#dc2626', '#16a34a', '#ca8a04', '#9333ea', '#0891b2']

/**
 * Pure-SVG chart renderer (bar / line / pie). Tiny and dependency-free so it
 * also works in MCP / SSR contexts. Not pretending to be a charting library —
 * intended for previews and the ChartSuggest AI flow.
 */
export function ChartPanel({ data, kind, title, width = 480, height = 280 }: ChartPanelProps) {
  if (data.series.length === 0) {
    return (
      <div style={{ width, height, display: 'grid', placeItems: 'center', color: '#9ca3af' }}>
        无数据
      </div>
    )
  }
  return (
    <div style={{ width }}>
      {title && <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{title}</div>}
      <svg width={width} height={height} role="img" aria-label={title ?? 'chart'}>
        {kind === 'bar' && <Bar data={data} width={width} height={height} />}
        {kind === 'line' && <Line data={data} width={width} height={height} />}
        {kind === 'pie' && <Pie data={data} width={width} height={height} />}
      </svg>
      <Legend data={data} />
    </div>
  )
}

function bounds(data: ChartData) {
  let max = 0
  let min = 0
  for (const s of data.series) {
    for (const p of s.points) {
      if (p.y > max) max = p.y
      if (p.y < min) min = p.y
    }
  }
  return { max: max === min ? max + 1 : max, min }
}

function Bar({ data, width, height }: { data: ChartData; width: number; height: number }) {
  const pad = 24
  const w = width - pad * 2
  const h = height - pad * 2
  const groups = data.series[0]?.points.length ?? 0
  const groupW = w / Math.max(groups, 1)
  const barW = groupW / Math.max(data.series.length, 1)
  const { max, min } = bounds(data)
  const yScale = (y: number) => h * (1 - (y - min) / (max - min))
  return (
    <g transform={`translate(${pad},${pad})`}>
      <line x1={0} y1={h} x2={w} y2={h} stroke="#d1d5db" />
      {data.series.map((s, si) =>
        s.points.map((p, pi) => (
          <rect
            key={`${si}-${pi}`}
            x={pi * groupW + si * barW}
            y={yScale(p.y)}
            width={Math.max(barW - 1, 1)}
            height={h - yScale(p.y)}
            fill={PALETTE[si % PALETTE.length]}
          />
        )),
      )}
    </g>
  )
}

function Line({ data, width, height }: { data: ChartData; width: number; height: number }) {
  const pad = 24
  const w = width - pad * 2
  const h = height - pad * 2
  const n = data.series[0]?.points.length ?? 0
  const xStep = w / Math.max(n - 1, 1)
  const { max, min } = bounds(data)
  const yScale = (y: number) => h * (1 - (y - min) / (max - min))
  return (
    <g transform={`translate(${pad},${pad})`}>
      <line x1={0} y1={h} x2={w} y2={h} stroke="#d1d5db" />
      {data.series.map((s, si) => (
        <polyline
          key={si}
          fill="none"
          strokeWidth={2}
          stroke={PALETTE[si % PALETTE.length]}
          points={s.points.map((p, pi) => `${pi * xStep},${yScale(p.y)}`).join(' ')}
        />
      ))}
    </g>
  )
}

function Pie({ data, width, height }: { data: ChartData; width: number; height: number }) {
  const cx = width / 2
  const cy = height / 2
  const r = Math.min(width, height) / 2 - 16
  const s0 = data.series[0]
  if (!s0) return null
  const total = s0.points.reduce((a, b) => a + Math.max(b.y, 0), 0)
  if (total === 0) return null
  let acc = 0
  return (
    <g>
      {s0.points.map((p, i) => {
        const start = (acc / total) * Math.PI * 2 - Math.PI / 2
        acc += Math.max(p.y, 0)
        const end = (acc / total) * Math.PI * 2 - Math.PI / 2
        const large = end - start > Math.PI ? 1 : 0
        const x1 = cx + r * Math.cos(start)
        const y1 = cy + r * Math.sin(start)
        const x2 = cx + r * Math.cos(end)
        const y2 = cy + r * Math.sin(end)
        return (
          <path
            key={i}
            d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`}
            fill={PALETTE[i % PALETTE.length]}
          />
        )
      })}
    </g>
  )
}

function Legend({ data }: { data: ChartData }) {
  return (
    <div style={{ display: 'flex', gap: 12, fontSize: 12, marginTop: 4, flexWrap: 'wrap' }}>
      {data.series.map((s, i) => (
        <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              background: PALETTE[i % PALETTE.length],
            }}
          />
          {s.label}
        </span>
      ))}
    </div>
  )
}
