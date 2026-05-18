import { Hono } from 'hono'
import type { AppEnv } from '../app'
import { requireIdentity } from '../auth'
import { requireCapability } from '../permission'

export const workbooksRoute = new Hono<AppEnv>()
  .use('*', requireIdentity)
  .post('/api/v1/workbooks', async (c) => {
    const id = c.get('identity')!
    const svc = c.get('services').workbooks
    const body = (await c.req.json()) as { name?: string; folderId?: string }
    if (!body.name) return c.json({ error: 'name required' }, 400)
    const wb = await svc.create({
      tenantId: id.tenantId,
      userId: id.userId,
      name: body.name,
      ...(body.folderId !== undefined ? { folderId: body.folderId } : {}),
    })
    if (!wb) throw new Error('insert returned no row')
    void c.get('services').events.emit({
      tenantId: id.tenantId,
      actorId: id.userId,
      type: 'workbook.created',
      resourceId: wb.id,
    })
    return c.json(wb, 201)
  })
  .get('/api/v1/workbooks', async (c) => {
    const id = c.get('identity')!
    const { permission } = c.get('deps')
    let all = await c.get('services').workbooks.listForTenant(id.tenantId)
    if (permission.filterListVisibility) {
      const filter = await permission.filterListVisibility(id, 'workbooks')
      if (filter.allowedIds !== undefined) {
        const set = new Set(filter.allowedIds)
        all = all.filter((w) => set.has(w.id))
      }
    }
    return c.json({ items: all })
  })
  .get(
    '/api/v1/workbooks/:id',
    requireCapability('canView', (c) => ({
      type: 'workbook',
      id: c.req.param('id'),
      tenantId: c.get('identity')!.tenantId,
    })),
    async (c) => {
      const id = c.get('identity')!
      const wb = await c
        .get('services')
        .workbooks.get({ tenantId: id.tenantId, id: c.req.param('id') })
      if (!wb) return c.json({ error: 'not found' }, 404)
      void c.get('services').events.emit({
        tenantId: id.tenantId,
        actorId: id.userId,
        type: 'workbook.opened',
        resourceId: wb.id,
      })
      return c.json(wb)
    },
  )
  .patch(
    '/api/v1/workbooks/:id',
    requireCapability('canEdit', (c) => ({
      type: 'workbook',
      id: c.req.param('id'),
      tenantId: c.get('identity')!.tenantId,
    })),
    async (c) => {
      const id = c.get('identity')!
      const wbId = c.req.param('id')
      const body = (await c.req.json()) as { name?: string; folderId?: string | null }
      if (body.name === undefined && body.folderId === undefined) {
        return c.json({ error: 'nothing to update' }, 400)
      }
      const before = await c.get('services').workbooks.get({ tenantId: id.tenantId, id: wbId })
      const updated = await c.get('services').workbooks.update({
        tenantId: id.tenantId,
        id: wbId,
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.folderId !== undefined ? { folderId: body.folderId } : {}),
      })
      if (!updated) return c.json({ error: 'not found or invalid input' }, 404)
      if (body.folderId !== undefined && before && before.folderId !== body.folderId)
        void c.get('services').events.emit({
          tenantId: id.tenantId,
          actorId: id.userId,
          type: 'workbook.moved',
          resourceId: wbId,
          extra: { fromFolderId: before.folderId, toFolderId: body.folderId },
        })
      return c.json(updated)
    },
  )
  .delete(
    '/api/v1/workbooks/:id',
    requireCapability('canDelete', (c) => ({
      type: 'workbook',
      id: c.req.param('id'),
      tenantId: c.get('identity')!.tenantId,
    })),
    async (c) => {
      const id = c.get('identity')!
      const wbId = c.req.param('id')
      await c.get('services').workbooks.softDelete({ tenantId: id.tenantId, id: wbId })
      void c.get('services').events.emit({
        tenantId: id.tenantId,
        actorId: id.userId,
        type: 'workbook.deleted',
        resourceId: wbId,
      })
      return c.body(null, 204)
    },
  )
