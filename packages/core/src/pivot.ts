// biome-ignore-all lint/style/noNonNullAssertion: array accesses are guarded by length checks that Biome cannot statically prove.
export type PivotAgg = 'sum' | 'count' | 'avg' | 'min' | 'max'

export interface PivotSpec {
  rows: string[]
  cols: string[]
  values: Array<{ field: string; agg: PivotAgg }>
}

export interface PivotResult {
  rowKeys: string[][]
  colKeys: string[][]
  cells: Array<Array<Array<number | null>>>
  rowHeaders: string[]
  colHeaders: string[]
  valueHeaders: string[]
}

type Row = Record<string, string | number | null>

export function computePivot(rows: Row[], spec: PivotSpec): PivotResult {
  const rowKeySet = new Map<string, string[]>()
  const colKeySet = new Map<string, string[]>()
  const buckets = new Map<string, Map<string, number[][]>>()

  for (const r of rows) {
    const rk = spec.rows.map((f) => String(r[f] ?? ''))
    const ck = spec.cols.map((f) => String(r[f] ?? ''))
    const rkey = rk.join('')
    const ckey = ck.join('')
    rowKeySet.set(rkey, rk)
    colKeySet.set(ckey, ck)
    let inner = buckets.get(rkey)
    if (!inner) {
      inner = new Map()
      buckets.set(rkey, inner)
    }
    let arr = inner.get(ckey)
    if (!arr) {
      arr = spec.values.map(() => [] as number[])
      inner.set(ckey, arr)
    }
    spec.values.forEach((v, i) => {
      const raw = r[v.field]
      const n = typeof raw === 'number' ? raw : Number(raw)
      if (Number.isFinite(n)) arr![i]!.push(n)
    })
  }

  const rowKeys = [...rowKeySet.values()].sort(compareKey)
  const colKeys = [...colKeySet.values()].sort(compareKey)

  const cells = rowKeys.map((rk) => {
    const rkey = rk.join('')
    const inner = buckets.get(rkey)
    return colKeys.map((ck) => {
      const ckey = ck.join('')
      const arr = inner?.get(ckey)
      return spec.values.map((v, i) => (arr ? reduce(arr[i] ?? [], v.agg) : null))
    })
  })

  return {
    rowKeys,
    colKeys,
    cells,
    rowHeaders: spec.rows,
    colHeaders: spec.cols,
    valueHeaders: spec.values.map((v) => `${v.agg}(${v.field})`),
  }
}

function compareKey(a: string[], b: string[]): number {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const av = a[i]!
    const bv = b[i]!
    if (av < bv) return -1
    if (av > bv) return 1
  }
  return a.length - b.length
}

function reduce(nums: number[], agg: PivotAgg): number | null {
  if (nums.length === 0) return null
  switch (agg) {
    case 'sum':
      return nums.reduce((a, b) => a + b, 0)
    case 'count':
      return nums.length
    case 'avg':
      return nums.reduce((a, b) => a + b, 0) / nums.length
    case 'min':
      return Math.min(...nums)
    case 'max':
      return Math.max(...nums)
  }
}
