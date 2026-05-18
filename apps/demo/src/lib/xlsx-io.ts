import type { ApiClient, UniverSheet, UniverWorkbookData } from '@ensemble-sheets/core'
import { xlsxToUniverJson } from '@ensemble-sheets/core'
import Papa from 'papaparse'

/**
 * Triggers a browser download of the workbook as xlsx. Goes through `fetch` (not a plain
 * `<a href>`) because the export endpoint requires the Authorization bearer token, which
 * can't be attached to anchor navigations.
 */
export async function downloadXlsx(
  baseUrl: string,
  token: string,
  wbId: string,
  filename: string,
): Promise<void> {
  const res = await fetch(`${baseUrl}/api/v1/workbooks/${wbId}/export.xlsx`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`下载失败 (${res.status})`)
  if (res.status === 204) throw new Error('工作簿尚无快照，先保存一次')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Maximum xlsx file size accepted for upload (5 MB). */
export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024

/**
 * Convert a local .xlsx file → Univer JSON → create a workbook → upload as the initial
 * snapshot. Returns the new workbook id.
 */
export async function uploadXlsx(
  api: ApiClient,
  file: File,
  name?: string,
): Promise<{ workbookId: string; name: string }> {
  if (file.size > UPLOAD_MAX_BYTES) {
    throw new Error(`文件过大（上限 ${UPLOAD_MAX_BYTES / 1024 / 1024} MB）`)
  }
  const buf = new Uint8Array(await file.arrayBuffer())
  const univer = xlsxToUniverJson(buf)
  const wbName = (name ?? file.name.replace(/\.xlsx$/i, '')) || '已导入工作簿'
  const wb = await api.createWorkbook(wbName)
  const snapshotBytes = new TextEncoder().encode(JSON.stringify(univer))
  await api.uploadSnapshot(wb.id, snapshotBytes, { reason: 'manual' })
  return { workbookId: wb.id, name: wbName }
}

/**
 * Maximum CSV file size accepted for upload (10 MB — text-based, larger row counts than xlsx).
 */
export const CSV_UPLOAD_MAX_BYTES = 10 * 1024 * 1024

function parseCellValue(s: string): string | number {
  if (s === '') return ''
  // Preserve leading zeros as text (phone numbers, ids).
  if (/^0\d/.test(s)) return s
  const n = Number(s)
  return Number.isFinite(n) && s.trim() !== '' ? n : s
}

export function csvRowsToUniverJson(rows: string[][], name: string): UniverWorkbookData {
  const sheetId = `sheet-${crypto.randomUUID()}`
  const cellData: UniverSheet['cellData'] = {}
  rows.forEach((row, r) => {
    if (row.length === 0) return
    const rowMap: Record<string, { v: string | number }> = {}
    row.forEach((cell, c) => {
      rowMap[c.toString()] = { v: parseCellValue(cell) }
    })
    cellData[r.toString()] = rowMap
  })
  return {
    id: `wb-${crypto.randomUUID()}`,
    sheetOrder: [sheetId],
    sheets: {
      [sheetId]: { id: sheetId, name: name || 'Sheet1', cellData },
    },
  }
}

export async function uploadCsv(
  api: ApiClient,
  file: File,
  name?: string,
): Promise<{ workbookId: string; name: string }> {
  if (file.size > CSV_UPLOAD_MAX_BYTES) {
    throw new Error(`文件过大（上限 ${CSV_UPLOAD_MAX_BYTES / 1024 / 1024} MB）`)
  }
  const text = await file.text()
  const parsed = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
    transform: (v) => v ?? '',
  })
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0]
    if (first) throw new Error(`CSV 解析失败：${first.message}`)
  }
  const rows = parsed.data
  if (rows.length === 0) throw new Error('CSV 为空')

  const wbName = (name ?? file.name.replace(/\.csv$/i, '')) || '已导入工作簿'
  const univer = csvRowsToUniverJson(rows, wbName)

  const wb = await api.createWorkbook(wbName)
  const snapshotBytes = new TextEncoder().encode(JSON.stringify(univer))
  await api.uploadSnapshot(wb.id, snapshotBytes, { reason: 'manual' })
  return { workbookId: wb.id, name: wbName }
}

export async function uploadFile(
  api: ApiClient,
  file: File,
  name?: string,
): Promise<{ workbookId: string; name: string }> {
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.csv')) return uploadCsv(api, file, name)
  return uploadXlsx(api, file, name)
}
