/**
 * Cell-level diff between two Univer workbook snapshots.
 *
 * Operates on raw JSON shapes (sheets[*].cellData[row][col].v); doesn't
 * require Univer engine. Output is a flat list of changes per sheet.
 */

interface CellLike {
  v?: unknown
}

interface SheetLike {
  cellData?: Record<string, Record<string, CellLike>>
}

interface WorkbookLike {
  sheets?: Record<string, SheetLike>
}

export type DiffOp = 'added' | 'removed' | 'changed'

export interface CellDiff {
  sheetId: string
  row: number
  col: number
  op: DiffOp
  /** Value in snapshot A (null for added). */
  from: unknown
  /** Value in snapshot B (null for removed). */
  to: unknown
}

export interface SnapshotDiff {
  cells: CellDiff[]
  totals: { added: number; removed: number; changed: number }
  sheetsAdded: string[]
  sheetsRemoved: string[]
}

function eqValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null && b == null) return true
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) && Number.isNaN(b)) return true
    return a === b
  }
  return JSON.stringify(a) === JSON.stringify(b)
}

export function diffSnapshots(a: WorkbookLike, b: WorkbookLike): SnapshotDiff {
  const sheetsA = new Set(Object.keys(a.sheets ?? {}))
  const sheetsB = new Set(Object.keys(b.sheets ?? {}))
  const sheetsAdded = [...sheetsB].filter((s) => !sheetsA.has(s))
  const sheetsRemoved = [...sheetsA].filter((s) => !sheetsB.has(s))
  const commonSheets = [...sheetsA].filter((s) => sheetsB.has(s))

  const cells: CellDiff[] = []
  let added = 0
  let removed = 0
  let changed = 0

  function pushOp(sheetId: string, row: number, col: number, from: unknown, to: unknown) {
    const aMissing = from === null || from === undefined
    const bMissing = to === null || to === undefined
    if (aMissing && bMissing) return
    if (aMissing) {
      cells.push({ sheetId, row, col, op: 'added', from: null, to })
      added++
    } else if (bMissing) {
      cells.push({ sheetId, row, col, op: 'removed', from, to: null })
      removed++
    } else if (!eqValue(from, to)) {
      cells.push({ sheetId, row, col, op: 'changed', from, to })
      changed++
    }
  }

  for (const sheetId of commonSheets) {
    const cellsA = a.sheets?.[sheetId]?.cellData ?? {}
    const cellsB = b.sheets?.[sheetId]?.cellData ?? {}
    const rows = new Set([...Object.keys(cellsA), ...Object.keys(cellsB)])
    for (const rowKey of rows) {
      const rowA = cellsA[rowKey] ?? {}
      const rowB = cellsB[rowKey] ?? {}
      const cols = new Set([...Object.keys(rowA), ...Object.keys(rowB)])
      for (const colKey of cols) {
        pushOp(
          sheetId,
          Number(rowKey),
          Number(colKey),
          rowA[colKey]?.v ?? null,
          rowB[colKey]?.v ?? null,
        )
      }
    }
  }

  for (const sheetId of sheetsAdded) {
    const cellsB = b.sheets?.[sheetId]?.cellData ?? {}
    for (const [rowKey, row] of Object.entries(cellsB)) {
      for (const [colKey, cell] of Object.entries(row)) {
        pushOp(sheetId, Number(rowKey), Number(colKey), null, cell?.v ?? null)
      }
    }
  }
  for (const sheetId of sheetsRemoved) {
    const cellsA = a.sheets?.[sheetId]?.cellData ?? {}
    for (const [rowKey, row] of Object.entries(cellsA)) {
      for (const [colKey, cell] of Object.entries(row)) {
        pushOp(sheetId, Number(rowKey), Number(colKey), cell?.v ?? null, null)
      }
    }
  }

  return { cells, totals: { added, removed, changed }, sheetsAdded, sheetsRemoved }
}
