import * as XLSX from 'xlsx'
import type { UniverSheet, UniverWorkbookData } from './types'

function sheetIdFromName(name: string, idx: number): string {
  return `sheet-${idx}-${name.replace(/[^a-zA-Z0-9_-]/g, '_')}`
}

export function xlsxToUniverJson(bytes: Uint8Array): UniverWorkbookData {
  const wb = XLSX.read(bytes, { type: 'array' })
  const sheetOrder: string[] = []
  const sheets: Record<string, UniverSheet> = {}
  wb.SheetNames.forEach((name, idx) => {
    const ws = wb.Sheets[name]
    if (!ws) return
    const id = sheetIdFromName(name, idx)
    sheetOrder.push(id)
    const cellData: UniverSheet['cellData'] = {}
    const ref = ws['!ref']
    const range = typeof ref === 'string' ? XLSX.utils.decode_range(ref) : null
    if (range) {
      for (let r = range.s.r; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          const addr = XLSX.utils.encode_cell({ r, c })
          const cell = ws[addr]
          if (!cell || cell.v === undefined) continue
          const row = (cellData[r.toString()] ??= {})
          row[c.toString()] = { v: cell.v, ...(cell.w ? { m: cell.w } : {}) }
        }
      }
    }
    sheets[id] = { id, name, cellData }
  })
  return { id: 'wb-' + crypto.randomUUID(), sheetOrder, sheets }
}

export function univerJsonToXlsx(data: UniverWorkbookData): Uint8Array {
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
