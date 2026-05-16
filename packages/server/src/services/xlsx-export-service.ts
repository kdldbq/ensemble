import * as XLSX from 'xlsx'
import type { WorkbookData } from './mask-service'

export function exportToXlsx(data: WorkbookData): Uint8Array {
  const wb = XLSX.utils.book_new()
  for (const sheetId of data.sheetOrder) {
    const sheet = data.sheets[sheetId]
    if (!sheet) continue
    const aoa: unknown[][] = []
    for (const rStr of Object.keys(sheet.cellData)) {
      const r = Number(rStr)
      const row = sheet.cellData[rStr]
      if (!row) continue
      const aoaRow = (aoa[r] ??= [])
      for (const cStr of Object.keys(row)) {
        const c = Number(cStr)
        const cell = row[cStr]
        if (cell) aoaRow[c] = cell.v
      }
    }
    for (let r = 0; r < aoa.length; r++) aoa[r] ??= []
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    XLSX.utils.book_append_sheet(wb, ws, sheet.name)
  }
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
}
