// biome-ignore-all lint/suspicious/noArrayIndexKey: pivot field rows are reordered via drag; index plus stable field name disambiguates.
// biome-ignore-all lint/style/noNonNullAssertion: field rows are accessed under length-guarded conditions that Biome's flow analysis can't see across the drag handlers.
import {
  computePivot,
  type MountHandle,
  type PivotAgg,
  type PivotResult,
  type PivotSpec,
} from '@ensemble-sheets/core'
import { useEffect, useMemo, useState } from 'react'

export interface PivotPanelProps {
  handle: Pick<MountHandle, 'readRange' | 'onMutationApplied'> | null
  /** A1 range with header row, e.g. "Sheet1!A1:E200". */
  rangeA1: string
  initialSpec?: PivotSpec
  className?: string
  style?: React.CSSProperties
}

interface FieldMeta {
  name: string
  numeric: boolean
}

const AGGS: PivotAgg[] = ['sum', 'count', 'avg', 'min', 'max']

export function PivotPanel({ handle, rangeA1, initialSpec, className, style }: PivotPanelProps) {
  const [grid, setGrid] = useState<Array<Array<string | number | null>>>([])

  useEffect(() => {
    if (!handle) return undefined
    setGrid(handle.readRange(rangeA1))
    return handle.onMutationApplied(() => setGrid(handle.readRange(rangeA1)))
  }, [handle, rangeA1])

  const { rows, fields, headers } = useMemo(() => parseRange(grid), [grid])

  const [spec, setSpec] = useState<PivotSpec>(initialSpec ?? { rows: [], cols: [], values: [] })

  useEffect(() => {
    setSpec((s) => ({
      rows: s.rows.filter((f) => headers.includes(f)),
      cols: s.cols.filter((f) => headers.includes(f)),
      values: s.values.filter((v) => headers.includes(v.field)),
    }))
  }, [headers])

  const result: PivotResult = useMemo(() => {
    if (spec.values.length === 0) {
      return {
        rowKeys: [],
        colKeys: [],
        cells: [],
        rowHeaders: [],
        colHeaders: [],
        valueHeaders: [],
      }
    }
    return computePivot(rows, spec)
  }, [rows, spec])

  return (
    <div
      className={`ensemble-pivot ${className ?? ''}`}
      style={{
        display: 'grid',
        gridTemplateColumns: '220px 1fr',
        gap: 12,
        fontSize: 13,
        ...style,
      }}
    >
      <FieldPickers fields={fields} spec={spec} onChange={setSpec} />
      <PivotTable result={result} />
    </div>
  )
}

function FieldPickers({
  fields,
  spec,
  onChange,
}: {
  fields: FieldMeta[]
  spec: PivotSpec
  onChange: (next: PivotSpec) => void
}) {
  const toggle = (which: 'rows' | 'cols', field: string) => {
    const cur = spec[which]
    onChange({
      ...spec,
      [which]: cur.includes(field) ? cur.filter((f) => f !== field) : [...cur, field],
    })
  }
  const toggleValue = (field: string) => {
    const has = spec.values.find((v) => v.field === field)
    onChange({
      ...spec,
      values: has
        ? spec.values.filter((v) => v.field !== field)
        : [...spec.values, { field, agg: 'sum' }],
    })
  }
  const setAgg = (field: string, agg: PivotAgg) => {
    onChange({
      ...spec,
      values: spec.values.map((v) => (v.field === field ? { ...v, agg } : v)),
    })
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Group title="行">
        {fields.map((f) => (
          <Chip
            key={`r-${f.name}`}
            on={spec.rows.includes(f.name)}
            onClick={() => toggle('rows', f.name)}
          >
            {f.name}
          </Chip>
        ))}
      </Group>
      <Group title="列">
        {fields.map((f) => (
          <Chip
            key={`c-${f.name}`}
            on={spec.cols.includes(f.name)}
            onClick={() => toggle('cols', f.name)}
          >
            {f.name}
          </Chip>
        ))}
      </Group>
      <Group title="值">
        {fields
          .filter((f) => f.numeric)
          .map((f) => {
            const v = spec.values.find((x) => x.field === f.name)
            return (
              <div key={`v-${f.name}`} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Chip on={!!v} onClick={() => toggleValue(f.name)}>
                  {f.name}
                </Chip>
                {v && (
                  <select
                    value={v.agg}
                    onChange={(e) => setAgg(f.name, e.target.value as PivotAgg)}
                    style={{ fontSize: 12 }}
                  >
                    {AGGS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )
          })}
      </Group>
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 4, color: '#374151' }}>{title}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{children}</div>
    </div>
  )
}

function Chip({
  on,
  children,
  onClick,
}: {
  on: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 12,
        border: `1px solid ${on ? '#2563eb' : '#d1d5db'}`,
        background: on ? '#dbeafe' : '#fff',
        color: on ? '#1d4ed8' : '#374151',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function PivotTable({ result }: { result: PivotResult }) {
  if (result.rowKeys.length === 0 || result.valueHeaders.length === 0) {
    return <div style={{ color: '#9ca3af', padding: 16 }}>选择行 / 列 / 值即可生成透视表。</div>
  }
  return (
    <div style={{ overflow: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {result.rowHeaders.map((h) => (
              <th key={`rh-${h}`} style={th}>
                {h}
              </th>
            ))}
            {result.colKeys.length > 0
              ? result.colKeys.flatMap((ck) =>
                  result.valueHeaders.map((vh) => (
                    <th key={`ch-${ck.join('|')}-${vh}`} style={th}>
                      {ck.join(' / ')} · {vh}
                    </th>
                  )),
                )
              : result.valueHeaders.map((vh) => (
                  <th key={`vh-${vh}`} style={th}>
                    {vh}
                  </th>
                ))}
          </tr>
        </thead>
        <tbody>
          {result.rowKeys.map((rk, ri) => (
            <tr key={rk.join('|') || `r${ri}`}>
              {rk.map((part, i) => (
                <td key={`rk-${ri}-${i}`} style={tdHeader}>
                  {part}
                </td>
              ))}
              {result.cells[ri]!.flat().map((cell, ci) => (
                <td key={`c-${ri}-${ci}`} style={td}>
                  {cell === null ? '' : typeof cell === 'number' ? format(cell) : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const th: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  padding: '4px 8px',
  background: '#f9fafb',
  fontWeight: 600,
  textAlign: 'left',
}
const td: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  padding: '4px 8px',
  textAlign: 'right',
}
const tdHeader: React.CSSProperties = {
  ...td,
  textAlign: 'left',
  background: '#f9fafb',
  fontWeight: 600,
}

function format(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(2)
}

function parseRange(grid: Array<Array<string | number | null>>): {
  headers: string[]
  rows: Array<Record<string, string | number | null>>
  fields: FieldMeta[]
} {
  if (grid.length < 2) return { headers: [], rows: [], fields: [] }
  const headerRow = grid[0]!
  const headers: string[] = headerRow.map((h, i) =>
    h == null || h === '' ? `col_${i + 1}` : String(h),
  )
  const rows: Array<Record<string, string | number | null>> = []
  for (let r = 1; r < grid.length; r++) {
    const row: Record<string, string | number | null> = {}
    for (let c = 0; c < headers.length; c++) {
      row[headers[c]!] = grid[r]![c] ?? null
    }
    rows.push(row)
  }
  const fields: FieldMeta[] = headers.map((name) => ({
    name,
    numeric: rows.length > 0 && rows.some((r) => typeof r[name] === 'number'),
  }))
  return { headers, rows, fields }
}
