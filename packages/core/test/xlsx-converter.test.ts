import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
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
