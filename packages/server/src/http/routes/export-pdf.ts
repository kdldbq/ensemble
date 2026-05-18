// biome-ignore-all lint/style/noNonNullAssertion: c.get(...) values are narrowed by the requireIdentity / requireCapability middleware that runs before every handler in this file; Biome cannot see the cross-middleware invariant.
import { Hono } from 'hono'
import type { PdfRendererAdapter } from '../../adapters/pdf'
import { applyMaskRules, type WorkbookData } from '../../services/mask-service'
import { renderWorkbookHtml } from '../../services/pdf-render-service'
import type { AppEnv } from '../app'
import { requireIdentity } from '../auth'
import { requireCapability } from '../permission'

/**
 * 9.5 — PDF export. Renders the latest snapshot to printable HTML and either
 * pipes it through a host-supplied PdfRendererAdapter or hands the HTML back
 * for the browser's own print pipeline.
 */
export const exportPdfRoute = new Hono<AppEnv>().use('*', requireIdentity).get(
  '/api/v1/workbooks/:wbId/export.pdf',
  requireCapability('canView', (c) => ({
    type: 'workbook',
    id: c.req.param('wbId'),
    tenantId: c.get('identity')!.tenantId,
  })),
  async (c) => {
    const idCtx = c.get('identity')!
    const wbId = c.req.param('wbId')
    const caps = c.get('capabilities')!
    const allowed = caps.canDownload ?? caps.canView
    if (!allowed) return c.json({ error: 'download capability denied' }, 403)

    const wb = await c.get('services').workbooks.get({ tenantId: idCtx.tenantId, id: wbId })
    if (!wb) return c.json({ error: 'not found' }, 404)
    const snap = await c.get('services').snapshots.getLatest(wb.id)
    if (!snap) return c.body(null, 204)
    const bytes = await c.get('deps').storage.get(snap.storageKey)
    const data = JSON.parse(new TextDecoder().decode(bytes)) as WorkbookData
    const rules = await c.get('services').masks.get(idCtx, wb.id)
    const masked = rules.length > 0 ? applyMaskRules(data, rules) : data

    const html = renderWorkbookHtml(masked, wb.name)
    const renderer = (c.get('deps') as { pdfRenderer?: PdfRendererAdapter }).pdfRenderer
    const safeName = wb.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    if (renderer) {
      const pdf = await renderer.render({ html, title: wb.name })
      return c.body(pdf, 200, {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${safeName}.pdf"`,
      })
    }
    return c.body(html, 200, { 'content-type': 'text/html; charset=utf-8' })
  },
)
