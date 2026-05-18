export type ChartKind = 'bar' | 'line' | 'pie'

export interface ChartSpec {
  id: string
  kind: ChartKind
  title?: string
  /** A1-style data range, e.g. "Sheet1!A1:C20". */
  range: string
  /** True if the first row holds series labels. */
  hasHeader?: boolean
}

export interface ChartSeries {
  label: string
  points: Array<{ x: string; y: number }>
}

export interface ChartData {
  series: ChartSeries[]
}

/**
 * Build chart series from a 2-D grid of cells.
 *
 * Conventions:
 *   - first column = x-axis labels
 *   - if hasHeader, first row = series names; otherwise series named "Series N"
 *   - non-numeric cells produce 0
 */
export function buildChartData(
  grid: Array<Array<string | number | null>>,
  hasHeader: boolean,
): ChartData {
  if (grid.length === 0) return { series: [] }
  const headerRow = grid[0] ?? []
  const dataRows = hasHeader ? grid.slice(1) : grid
  const ncols = grid[0]?.length ?? 0
  if (ncols < 2) return { series: [] }

  const seriesCount = ncols - 1
  const series: ChartSeries[] = []
  for (let s = 0; s < seriesCount; s++) {
    const label = hasHeader ? String(headerRow[s + 1] ?? `Series ${s + 1}`) : `Series ${s + 1}`
    const points = dataRows.map((row) => ({
      x: String(row[0] ?? ''),
      y: toNumber(row[s + 1]),
    }))
    series.push({ label, points })
  }
  return { series }
}

function toNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export interface FreezeConfig {
  rows: number
  cols: number
}
