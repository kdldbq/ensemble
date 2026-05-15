import { createHash } from 'node:crypto'
import type { MaskRule } from '../adapters/types'

export interface SheetData {
  id: string
  name: string
  cellData: Record<string, Record<string, { v?: unknown; m?: string }>>
}
export interface WorkbookData {
  id: string
  sheetOrder: string[]
  sheets: Record<string, SheetData>
}

function columnLetterToIndex(letter: string): number {
  let n = 0
  for (const ch of letter.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function maskCell(cell: { v?: unknown; m?: string }, action: MaskRule['action']): { v: unknown; m?: string } {
  if (cell.v === undefined || cell.v === null) return cell as { v: unknown }
  switch (action.type) {
    case 'redact': return { v: action.replacement }
    case 'hash': {
      const h = createHash('sha256').update(String(cell.v)).digest('hex').slice(0, 8)
      return { v: '#' + h }
    }
    case 'remove': return { v: null }
  }
}

function sheetMatches(rule: MaskRule['match'], sheet: SheetData): boolean {
  return rule.sheet === '*' || rule.sheet === sheet.name || rule.sheet === sheet.id
}

function headerColumnIndex(sheet: SheetData, headerText: string): number | null {
  const row0 = sheet.cellData['0']
  if (!row0) return null
  for (const colStr of Object.keys(row0)) {
    const cell = row0[colStr]
    if (cell && cell.v === headerText) return Number(colStr)
  }
  return null
}

function applyToSheet(sheet: SheetData, rule: MaskRule): void {
  if (!sheetMatches(rule.match, sheet)) return

  if (rule.match.type === 'column') {
    const colIdx = columnLetterToIndex(rule.match.column)
    for (const rowStr of Object.keys(sheet.cellData)) {
      const row = sheet.cellData[rowStr]
      if (!row) continue
      const cell = row[String(colIdx)]
      if (cell) row[String(colIdx)] = maskCell(cell, rule.action)
    }
    return
  }

  if (rule.match.type === 'header') {
    const colIdx = headerColumnIndex(sheet, rule.match.headerText)
    if (colIdx === null) return
    for (const rowStr of Object.keys(sheet.cellData)) {
      if (rowStr === '0') continue
      const row = sheet.cellData[rowStr]
      if (!row) continue
      const cell = row[String(colIdx)]
      if (cell) row[String(colIdx)] = maskCell(cell, rule.action)
    }
    return
  }

  if (rule.match.type === 'row') {
    const predicateColIdx = headerColumnIndex(sheet, rule.match.where.field)
    if (predicateColIdx === null) return
    for (const rowStr of Object.keys(sheet.cellData)) {
      if (rowStr === '0') continue
      const row = sheet.cellData[rowStr]
      if (!row) continue
      const predicateCell = row[String(predicateColIdx)]
      if (!predicateCell) continue
      const ok = rule.match.where.op === 'eq'
        ? predicateCell.v === rule.match.where.value
        : Array.isArray(rule.match.where.value) && rule.match.where.value.includes(predicateCell.v)
      if (!ok) continue
      for (const colStr of Object.keys(row)) {
        const cell = row[colStr]
        if (cell) row[colStr] = maskCell(cell, rule.action)
      }
    }
  }
}

export function applyMaskRules(workbook: WorkbookData, rules: MaskRule[]): WorkbookData {
  const clone: WorkbookData = JSON.parse(JSON.stringify(workbook))
  for (const sheetId of clone.sheetOrder) {
    const sheet = clone.sheets[sheetId]
    if (!sheet) continue
    for (const rule of rules) applyToSheet(sheet, rule)
  }
  return clone
}
