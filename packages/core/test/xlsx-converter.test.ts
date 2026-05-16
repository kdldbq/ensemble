import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { univerJsonToXlsx, xlsxToUniverJson } from '../src/xlsx-converter'

function makeXlsx(): Uint8Array {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([
    ['Name', 'Score'],
    ['Alice', 90],
    ['Bob', 85.5],
  ])
  XLSX.utils.book_append_sheet(wb, ws, 'Grades')
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
}

describe('xlsx-converter', () => {
  it('xlsx → Univer JSON keeps sheet name and cell values', () => {
    const ujson = xlsxToUniverJson(makeXlsx())
    expect(ujson.sheetOrder.length).toBe(1)
    const firstSheetId = ujson.sheetOrder[0]
    const sheet = ujson.sheets[firstSheetId]
    expect(sheet.name).toBe('Grades')
    expect(sheet.cellData['0']['0'].v).toBe('Name')
    expect(sheet.cellData['1']['1'].v).toBe(90)
    expect(sheet.cellData['2']['1'].v).toBe(85.5)
  })

  it('xlsxToUniverJson: sheet with no !ref (empty sheet) produces empty cellData', () => {
    const wb = XLSX.utils.book_new()
    const ws: XLSX.WorkSheet = {} // no !ref key → range is null branch
    XLSX.utils.book_append_sheet(wb, ws, 'Empty')
    const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
    const ujson = xlsxToUniverJson(bytes)
    const firstId = ujson.sheetOrder[0]
    expect(Object.keys(ujson.sheets[firstId].cellData)).toHaveLength(0)
  })

  it('xlsxToUniverJson: cell with formatted text (cell.w) sets m property', () => {
    // Build a raw worksheet buffer where the cell has a formatted string (w).
    // We do this by calling xlsxToUniverJson on raw bytes that XLSX parses with
    // a `w` property — we craft it via a number-format cell in the sheet.
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([[1234.5]])
    // Apply a number format so XLSX populates cell.w on re-read
    if (!wb.SSF) wb.SSF = {}
    ws.A1 = { t: 'n', v: 1234.5, z: '"$"#,##0.00', w: '$1,234.50' }
    XLSX.utils.book_append_sheet(wb, ws, 'Formatted')
    // Write then read back so XLSX preserves the w field
    const bytes = new Uint8Array(
      XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellStyles: true }),
    )
    const ujson = xlsxToUniverJson(bytes)
    const firstId = ujson.sheetOrder[0]
    // m should be set when cell.w is present
    expect(ujson.sheets[firstId].cellData['0']['0'].m).toBeDefined()
  })

  it('univerJsonToXlsx: sparse rows (gap in row index) fills aoa gaps', () => {
    const data = {
      id: 'wb',
      sheetOrder: ['s1'],
      sheets: {
        s1: {
          id: 's1',
          name: 'Sparse',
          cellData: {
            '0': { '0': { v: 'top' } },
            '3': { '1': { v: 'bottom' } }, // row 3, gap at 1 and 2
          },
        },
      },
    }
    const bytes = univerJsonToXlsx(data as never)
    const wb = XLSX.read(bytes, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][]
    expect(rows[0][0]).toBe('top')
    expect(rows[3][1]).toBe('bottom')
  })

  it('Univer JSON → xlsx round-trips back to the same cell values', () => {
    const ujson = xlsxToUniverJson(makeXlsx())
    const bytes = univerJsonToXlsx(ujson)
    const wb = XLSX.read(bytes, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    expect(XLSX.utils.sheet_to_json(ws, { header: 1 })).toEqual([
      ['Name', 'Score'],
      ['Alice', 90],
      ['Bob', 85.5],
    ])
  })
})
