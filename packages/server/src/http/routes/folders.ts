import { Hono } from 'hono'
import type { AppEnv } from '../app'
import { requireIdentity } from '../auth'
import { requireCapability } from '../permission'

export const foldersRoute = new Hono<AppEnv>()
  .use('*', requireIdentity)
  .get('/api/v1/folders', async (c) => {
    const id = c.get('identity')!
    let items = await c.get('services').folders.listForTenant(id.tenantId)
    const { permission } = c.get('deps')
    if (permission.filterListVisibility) {
      const filter = await permission.filterListVisibility(id, 'folders')
      if (filter.allowedIds !== undefined) {
        const set = new Set(filter.allowedIds)
        items = items.filter((f) => set.has(f.id))
      }
    }
    return c.json({ items })
  })
  .post('/api/v1/folders', async (c) => {
    const id = c.get('identity')!
    const body = (await c.req.json()) as {
      name?: string
      parentId?: string | null
      spaceType?: 'personal' | 'shared'
    }
    if (!body.name) return c.json({ error: 'name required' }, 400)
    if (body.spaceType !== 'personal' && body.spaceType !== 'shared') {
      return c.json({ error: 'spaceType must be personal or shared' }, 400)
    }
    if (body.parentId) {
      const cap = await c.get('deps').permission.getCapabilities(id, {
        type: 'folder',
        id: body.parentId,
        tenantId: id.tenantId,
      })
      if (!cap.canEdit) return c.json({ error: 'cannot create folder under this parent' }, 403)
    }
    const created = await c.get('services').folders.create({
      tenantId: id.tenantId,
      userId: id.userId,
      name: body.name,
      parentId: body.parentId ?? null,
      spaceType: body.spaceType,
    })
    if (created)
      void c.get('services').events.emit({
        tenantId: id.tenantId,
        actorId: id.userId,
        type: 'folder.created',
        resourceId: created.id,
      })
    return c.json(created, 201)
  })
  .patch(
    '/api/v1/folders/:id',
    requireCapability('canEdit', (c) => ({
      type: 'folder',
      id: c.req.param('id'),
      tenantId: c.get('identity')?.tenantId,
    })),
    async (c) => {
      const id = c.get('identity')!
      const folderId = c.req.param('id')
      const body = (await c.req.json()) as { name?: string; parentId?: string | null }
      try {
        if (body.parentId !== undefined) {
          const moved = await c.get('services').folders.move({
            tenantId: id.tenantId,
            id: folderId,
            newParentId: body.parentId,
          })
          if (!moved) return c.json({ error: 'not found' }, 404)
          if (body.name === undefined) return c.json(moved)
        }
        if (body.name !== undefined) {
          const renamed = await c.get('services').folders.rename({
            tenantId: id.tenantId,
            id: folderId,
            name: body.name,
          })
          if (!renamed) return c.json({ error: 'not found' }, 404)
          return c.json(renamed)
        }
        return c.json({ error: 'nothing to update' }, 400)
      } catch (err) {
        if (err instanceof Error && /cycle/i.test(err.message)) {
          return c.json({ error: 'move would create a cycle' }, 400)
        }
        throw err
      }
    },
  )
  .delete(
    '/api/v1/folders/:id',
    requireCapability('canDelete', (c) => ({
      type: 'folder',
      id: c.req.param('id'),
      tenantId: c.get('identity')?.tenantId,
    })),
    async (c) => {
      const id = c.get('identity')!
      await c.get('services').folders.softDelete({ tenantId: id.tenantId, id: c.req.param('id') })
      return c.body(null, 204)
    },
  )
