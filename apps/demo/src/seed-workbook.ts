import type { UniverWorkbookData } from '@ensemble-sheets/core'

/**
 * Builds a small workbook with realistic-looking content. Column B is filled with values
 * that viewers cannot see (masked to `***`) so the permission demo is obvious on first open.
 */
export function makeSeedWorkbook(title: string): UniverWorkbookData {
  const sheetId = 'sheet-0-grades'
  const cellData: UniverWorkbookData['sheets'][string]['cellData'] = {}
  const rows: Array<[string, string, string | number]> = [
    ['Name', 'Secret notes (column B)', 'Score'],
    ['Alice', 'parents requested IEP', 92],
    ['Bob', 'transferring next term', 78],
    ['Charlie', 'on financial aid', 85],
    ['Diana', 'special diet — peanuts', 95],
    ['Erik', 'recently lost parent', 71],
  ]
  rows.forEach((row, r) => {
    const rowData: Record<string, { v?: unknown }> = {}
    row.forEach((v, c) => {
      rowData[String(c)] = { v }
    })
    cellData[String(r)] = rowData
  })
  return {
    id: `seed-${title.replace(/\s+/g, '-').toLowerCase()}`,
    sheetOrder: [sheetId],
    sheets: {
      [sheetId]: { id: sheetId, name: title, cellData },
    },
  }
}
