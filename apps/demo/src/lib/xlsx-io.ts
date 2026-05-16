import type { ApiClient } from '@ensemble-sheets/core'
import { xlsxToUniverJson } from '@ensemble-sheets/core'

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
