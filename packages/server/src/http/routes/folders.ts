import { Hono } from 'hono'
import { FolderValidationError } from '../../services/folder-service'
import type { AppEnv } from '../app'
import { requireIdentity } from '../auth'
import { requireCapability } from '../permission'

function validationErrorToResponse(err: unknown) {
  if (err instanceof FolderValidationError) {
    const status = err.code === 'duplicate_name' || err.code === 'name_invalid' ? 422 : 400
    return { body: { error: err.message, code: err.code }, status } as const
  }
  return null
}

export const foldersRoute = new Hono<AppEnv>()
  .use('*', requireIdentity)
  // Trash MUST be registered before the generic param routes so it matches first.
  .get('/api/v1/folders/trash', async (c) => {
    const id = c.get('identity')!
    const items = await c.get('services').folders.listTrashed(id.tenantId)
    return c.json({ items })
  })
  .get('/api/v1/folders', async (c) => {
    const id = c.get('identity')!
    const includeDeleted = c.req.query('include_deleted') === 'true'
    let items = await c
      .get('services')
      .folders.listForTenant(id.tenantId, { includeDeleted })
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
    try {
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
    } catch (err) {
      const resp = validationErrorToResponse(err)
      if (resp) return c.json(resp.body, resp.status)
      throw err
    }
  })
  .patch(
    '/api/v1/folders/:id/reorder',
    requireCapability('canEdit', (c) => ({
      type: 'folder',
      id: c.req.param('id'),
      tenantId: c.get('identity')!.tenantId,
    })),
    async (c) => {
      const id = c.get('identity')!
      const folderId = c.req.param('id')
      const body = (await c.req.json()) as {
        newPosition?: number
        newParentId?: string | null
      }
      if (typeof body.newPosition !== 'number' || body.newPosition < 0) {
        return c.json({ error: 'newPosition must be a non-negative integer' }, 400)
      }
      try {
        const before = (
          await c
            .get('services')
            .folders.listForTenant(id.tenantId, { includeDeleted: false })
        ).find((f) => f.id === folderId)

        const reordered = await c.get('services').folders.reorder({
          tenantId: id.tenantId,
          id: folderId,
          newPosition: body.newPosition,
          ...(body.newParentId !== undefined ? { newParentId: body.newParentId } : {}),
        })
        if (!reordered) return c.json({ error: 'not found' }, 404)
        if (
          body.newParentId !== undefined &&
          before &&
          before.parentId !== body.newParentId
        )
          void c.get('services').events.emit({
            tenantId: id.tenantId,
            actorId: id.userId,
            type: 'folder.moved',
            resourceId: folderId,
            extra: { fromParentId: before.parentId, toParentId: body.newParentId },
          })
        return c.json(reordered)
      } catch (err) {
        const resp = validationErrorToResponse(err)
        if (resp) return c.json(resp.body, resp.status)
        throw err
      }
    },
  )
  .post(
    '/api/v1/folders/:id/restore',
    requireCapability('canEdit', (c) => ({
      type: 'folder',
      id: c.req.param('id'),
      tenantId: c.get('identity')!.tenantId,
    })),
    async (c) => {
      const id = c.get('identity')!
      const folderId = c.req.param('id')
      const restored = await c.get('services').folders.restore({
        tenantId: id.tenantId,
        id: folderId,
      })
      if (!restored) return c.json({ error: 'not found' }, 404)
      void c.get('services').events.emit({
        tenantId: id.tenantId,
        actorId: id.userId,
        type: 'folder.restored',
        resourceId: folderId,
      })
      return c.json(restored)
    },
  )
  .patch(
    '/api/v1/folders/:id',
    requireCapability('canEdit', (c) => ({
      type: 'folder',
      id: c.req.param('id'),
      tenantId: c.get('identity')!.tenantId,
    })),
    async (c) => {
      const id = c.get('identity')!
      const folderId = c.req.param('id')
      const body = (await c.req.json()) as { name?: string; parentId?: string | null }
      try {
        if (body.parentId !== undefined) {
          const before = (
            await c
              .get('services')
              .folders.listForTenant(id.tenantId, { includeDeleted: false })
          ).find((f) => f.id === folderId)

          const moved = await c.get('services').folders.move({
            tenantId: id.tenantId,
            id: folderId,
            newParentId: body.parentId,
          })
          if (!moved) return c.json({ error: 'not found' }, 404)
          if (before && before.parentId !== body.parentId)
            void c.get('services').events.emit({
              tenantId: id.tenantId,
              actorId: id.userId,
              type: 'folder.moved',
              resourceId: folderId,
              extra: { fromParentId: before.parentId, toParentId: body.parentId },
            })
          if (body.name === undefined) return c.json(moved)
        }
        if (body.name !== undefined) {
          const renamed = await c.get('services').folders.rename({
            tenantId: id.tenantId,
            id: folderId,
            name: body.name,
          })
          if (!renamed) return c.json({ error: 'not found' }, 404)
          void c.get('services').events.emit({
            tenantId: id.tenantId,
            actorId: id.userId,
            type: 'folder.renamed',
            resourceId: folderId,
            extra: { newName: renamed.name },
          })
          return c.json(renamed)
        }
        return c.json({ error: 'nothing to update' }, 400)
      } catch (err) {
        const resp = validationErrorToResponse(err)
        if (resp) return c.json(resp.body, resp.status)
        throw err
      }
    },
  )
  .delete(
    '/api/v1/folders/:id',
    requireCapability('canDelete', (c) => ({
      type: 'folder',
      id: c.req.param('id'),
      tenantId: c.get('identity')!.tenantId,
    })),
    async (c) => {
      const id = c.get('identity')!
      const folderId = c.req.param('id')
      await c.get('services').folders.softDelete({ tenantId: id.tenantId, id: folderId })
      void c.get('services').events.emit({
        tenantId: id.tenantId,
        actorId: id.userId,
        type: 'folder.deleted',
        resourceId: folderId,
      })
      return c.body(null, 204)
    },
  )
