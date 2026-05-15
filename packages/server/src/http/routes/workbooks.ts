import { Hono } from 'hono'
import { createWorkbookService } from '../../services/workbook-service'
import { requireIdentity } from '../auth'
import type { AppEnv } from '../app'

export const workbooksRoute = new Hono<AppEnv>()
  .use('*', requireIdentity)
  .post('/api/v1/workbooks', async (c) => {
    const { db } = c.get('deps')
    const id = c.get('identity')!
    const body = (await c.req.json()) as { name?: string; folderId?: string }
    if (!body.name) return c.json({ error: 'name required' }, 400)
    const svc = createWorkbookService(db)
    const wb = await svc.create({ tenantId: id.tenantId, userId: id.userId, name: body.name, ...(body.folderId !== undefined ? { folderId: body.folderId } : {}) })
    return c.json(wb, 201)
  })
  .get('/api/v1/workbooks', async (c) => {
    const { db } = c.get('deps')
    const id = c.get('identity')!
    const items = await createWorkbookService(db).listForTenant(id.tenantId)
    return c.json({ items })
  })
  .get('/api/v1/workbooks/:id', async (c) => {
    const { db } = c.get('deps')
    const id = c.get('identity')!
    const wb = await createWorkbookService(db).get({ tenantId: id.tenantId, id: c.req.param('id') })
    if (!wb) return c.json({ error: 'not found' }, 404)
    return c.json(wb)
  })
  .delete('/api/v1/workbooks/:id', async (c) => {
    const { db } = c.get('deps')
    const id = c.get('identity')!
    await createWorkbookService(db).softDelete({ tenantId: id.tenantId, id: c.req.param('id') })
    return c.body(null, 204)
  })
