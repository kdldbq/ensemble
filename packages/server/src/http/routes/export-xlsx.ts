import { Hono } from 'hono'
import { type WorkbookData, applyMaskRules } from '../../services/mask-service'
import { exportToXlsx } from '../../services/xlsx-export-service'
import type { AppEnv } from '../app'
import { requireIdentity } from '../auth'
import { requireCapability } from '../permission'

export const exportXlsxRoute = new Hono<AppEnv>().use('*', requireIdentity).get(
  '/api/v1/workbooks/:wbId/export.xlsx',
  requireCapability('canView', (c) => ({
    type: 'workbook',
    id: c.req.param('wbId'),
    tenantId: c.get('identity')!.tenantId,
  })),
  async (c) => {
    const idCtx = c.get('identity')!
    const wbId = c.req.param('wbId')
    // Honour canDownload capability (defaults to canView when undefined).
    const caps = c.get('capabilities')!
    const allowed = caps.canDownload ?? caps.canView
    if (!allowed) {
      return c.json({ error: 'download capability denied' }, 403)
    }
    const wb = await c.get('services').workbooks.get({ tenantId: idCtx.tenantId, id: wbId })
    if (!wb) return c.json({ error: 'not found' }, 404)
    const snap = await c.get('services').snapshots.getLatest(wb.id)
    if (!snap) return c.body(null, 204)
    const bytes = await c.get('deps').storage.get(snap.storageKey)
    const data = JSON.parse(new TextDecoder().decode(bytes)) as WorkbookData
    const rules = await c.get('services').masks.get(idCtx, wb.id)
    const masked = rules.length > 0 ? applyMaskRules(data, rules) : data
    const xlsxBytes = exportToXlsx(masked)
    return c.body(xlsxBytes, 200, {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${wb.name.replace(/[^a-zA-Z0-9._-]/g, '_')}.xlsx"`,
    })
  },
)
