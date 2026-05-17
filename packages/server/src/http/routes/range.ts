import { Hono } from 'hono'
import type { AppEnv } from '../app'
import { requireIdentity } from '../auth'
import { requireCapability } from '../permission'

interface UniverSheetLike {
  cellData?: Record<string, Record<string, { v?: unknown }>>
}

interface UniverWorkbookLike {
  sheets?: Record<string, UniverSheetLike>
}

function parseA1Range(
  ref: string,
): { startRow: number; startCol: number; endRow: number; endCol: number } | null {
  const trimmed = ref.replace(/\s+/g, '')
  const parts = trimmed.split(':')
  if (parts.length === 0 || parts.length > 2) return null
  const single = parts[0]!
  const second = parts.length === 2 ? parts[1] : single
  const start = parseA1Cell(single)
  const end = parseA1Cell(second ?? single)
  if (!start || !end) return null
  return {
    startRow: Math.min(start.row, end.row),
    startCol: Math.min(start.col, end.col),
    endRow: Math.max(start.row, end.row),
    endCol: Math.max(start.col, end.col),
  }
}

function parseA1Cell(s: string): { row: number; col: number } | null {
  const m = /^([A-Z]+)([0-9]+)?$/.exec(s)
  if (!m || !m[1]) return null
  let col = 0
  for (const ch of m[1]) {
    col = col * 26 + (ch.charCodeAt(0) - 64)
  }
  col -= 1
  const row = m[2] ? Number(m[2]) - 1 : 0
  return { row, col }
}

export const rangeRoute = new Hono<AppEnv>()
  .use('*', requireIdentity)
  .post(
    '/api/v1/workbooks/:id/range/read',
    requireCapability('canView', (c) => ({
      type: 'workbook',
      id: c.req.param('id'),
      tenantId: c.get('identity')!.tenantId,
    })),
    async (c) => {
      const id = c.get('identity')!
      const wbId = c.req.param('id')
      const body = (await c.req.json()) as { sheetId?: string; rangeRef?: string }
      if (!body.sheetId || !body.rangeRef) {
        return c.json({ error: 'sheetId and rangeRef required' }, 400)
      }
      const parsed = parseA1Range(body.rangeRef)
      if (!parsed) return c.json({ error: 'invalid rangeRef' }, 400)

      const latest = await c.get('services').snapshots.getLatest(wbId)
      if (!latest) {
        return c.json({ values: [], rangeRef: body.rangeRef, empty: true })
      }
      // Defense-in-depth: ensure the snapshot belongs to this tenant via workbook.
      const wb = await c
        .get('services')
        .workbooks.get({ tenantId: id.tenantId, id: wbId })
      if (!wb) return c.json({ error: 'workbook not found in tenant' }, 404)
      const bytes = await c.get('deps').storage.get(latest.storageKey)
      let workbook: UniverWorkbookLike
      try {
        workbook = JSON.parse(new TextDecoder().decode(bytes)) as UniverWorkbookLike
      } catch {
        return c.json({ error: 'snapshot is not valid JSON' }, 500)
      }
      const sheet = workbook.sheets?.[body.sheetId]
      if (!sheet) return c.json({ error: `sheet "${body.sheetId}" not found` }, 404)

      const values: unknown[][] = []
      for (let r = parsed.startRow; r <= parsed.endRow; r++) {
        const row: unknown[] = []
        const rowData = sheet.cellData?.[r.toString()]
        for (let col = parsed.startCol; col <= parsed.endCol; col++) {
          const cell = rowData?.[col.toString()]
          row.push(cell?.v ?? null)
        }
        values.push(row)
      }
      return c.json({
        sheetId: body.sheetId,
        rangeRef: body.rangeRef,
        rows: parsed.endRow - parsed.startRow + 1,
        cols: parsed.endCol - parsed.startCol + 1,
        values,
      })
    },
  )
