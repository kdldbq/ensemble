// biome-ignore-all lint/style/noNonNullAssertion: c.get(...) values are narrowed by the requireIdentity / requireCapability middleware that runs before every handler in this file; Biome cannot see the cross-middleware invariant.
import { Hono } from 'hono'
import type { TemplateAdapter } from '../../adapters/enterprise'
import type { AppEnv } from '../app'
import { requireIdentity } from '../auth'

/**
 * 7.9 — Template catalog REST.
 *
 * Lists host-curated workbook templates and instantiates one into a new
 * workbook owned by the calling user. Returns 503 when no TemplateAdapter is
 * wired so clients can branch on capability instead of confusing 404 + empty.
 */
export const templatesRoute = new Hono<AppEnv>()
  .use('*', requireIdentity)
  .get('/api/v1/templates', async (c) => {
    const idCtx = c.get('identity')!
    const adapter = (c.get('deps') as { templates?: TemplateAdapter }).templates
    if (!adapter) return c.json({ items: [], notice: 'no template adapter configured' })
    const items = await adapter.listTemplates(idCtx.tenantId)
    return c.json({
      items: items.map((t) => ({
        id: t.id,
        name: t.name,
        ...(t.description ? { description: t.description } : {}),
        ...(t.category ? { category: t.category } : {}),
      })),
    })
  })
  .post('/api/v1/templates/:id/instantiate', async (c) => {
    const idCtx = c.get('identity')!
    const adapter = (c.get('deps') as { templates?: TemplateAdapter }).templates
    if (!adapter) return c.json({ error: 'no template adapter configured' }, 503)
    const tpl = await adapter.getTemplate(idCtx.tenantId, c.req.param('id'))
    if (!tpl) return c.json({ error: 'template not found' }, 404)
    const body = (await c.req.json().catch(() => ({}))) as { folderId?: string; name?: string }
    const wb = await c.get('services').workbooks.create({
      tenantId: idCtx.tenantId,
      userId: idCtx.userId,
      name: body.name ?? tpl.name,
      ...(body.folderId ? { folderId: body.folderId } : {}),
    })
    if (!wb) return c.json({ error: 'workbook creation failed' }, 500)
    const snap = await c.get('services').snapshots.create({
      tenantId: idCtx.tenantId,
      workbookId: wb.id,
      userId: idCtx.userId,
      body: new TextEncoder().encode(JSON.stringify(tpl.data)),
      reason: 'manual',
      name: `from template: ${tpl.name}`,
    })
    return c.json({ workbookId: wb.id, snapshotId: snap?.id ?? null }, 201)
  })
