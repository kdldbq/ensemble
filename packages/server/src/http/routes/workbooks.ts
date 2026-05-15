import { Hono } from 'hono'
import { requireIdentity } from '../auth'
import { requireCapability } from '../permission'
import type { AppEnv } from '../app'

export const workbooksRoute = new Hono<AppEnv>()
  .use('*', requireIdentity)
  .post('/api/v1/workbooks', async (c) => {
    const id = c.get('identity')!
    const svc = c.get('services').workbooks
    const body = (await c.req.json()) as { name?: string; folderId?: string }
    if (!body.name) return c.json({ error: 'name required' }, 400)
    const wb = await svc.create({ tenantId: id.tenantId, userId: id.userId, name: body.name, ...(body.folderId !== undefined ? { folderId: body.folderId } : {}) })
    return c.json(wb, 201)
  })
  .get('/api/v1/workbooks', async (c) => {
    const id = c.get('identity')!
    const items = await c.get('services').workbooks.listForTenant(id.tenantId)
    return c.json({ items })
  })
  .get(
    '/api/v1/workbooks/:id',
    requireCapability('canView', (c) => ({ type: 'workbook', id: c.req.param('id'), tenantId: c.get('identity')!.tenantId })),
    async (c) => {
      const id = c.get('identity')!
      const wb = await c.get('services').workbooks.get({ tenantId: id.tenantId, id: c.req.param('id') })
      if (!wb) return c.json({ error: 'not found' }, 404)
      return c.json(wb)
    },
  )
  .delete(
    '/api/v1/workbooks/:id',
    requireCapability('canDelete', (c) => ({ type: 'workbook', id: c.req.param('id'), tenantId: c.get('identity')!.tenantId })),
    async (c) => {
      const id = c.get('identity')!
      await c.get('services').workbooks.softDelete({ tenantId: id.tenantId, id: c.req.param('id') })
      return c.body(null, 204)
    },
  )
