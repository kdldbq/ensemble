import { and, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { folders as foldersTable, workbooks as workbooksTable } from '../../db/schema'
import { FolderValidationError } from '../../services/folder-service'
import type { AppEnv } from '../app'
import { requireIdentity } from '../auth'
import { requireCapability } from '../permission'

interface FolderTreeNode {
  id: string
  parentId: string | null
  name: string
  spaceType: 'personal' | 'shared'
  position: number
  children: FolderTreeNode[]
  depth: number
}

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
    const asTree = c.req.query('tree') === 'true'
    let items = await c.get('services').folders.listForTenant(id.tenantId, { includeDeleted })
    const { permission } = c.get('deps')
    if (permission.filterListVisibility) {
      const filter = await permission.filterListVisibility(id, 'folders')
      if (filter.allowedIds !== undefined) {
        const set = new Set(filter.allowedIds)
        items = items.filter((f) => set.has(f.id))
      }
    }
    if (!asTree) return c.json({ items })

    // Build flat→tree server-side. Clients can keep using flat list, this is opt-in.
    const byParent = new Map<string | null, typeof items>()
    for (const f of items) {
      const arr = byParent.get(f.parentId) ?? []
      arr.push(f)
      byParent.set(f.parentId, arr)
    }
    for (const arr of byParent.values()) {
      arr.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
    }
    function build(parentId: string | null, depth: number): FolderTreeNode[] {
      return (byParent.get(parentId) ?? []).map((f) => ({
        id: f.id,
        parentId: f.parentId,
        name: f.name,
        spaceType: f.spaceType,
        position: f.position,
        depth,
        children: build(f.id, depth + 1),
      }))
    }
    return c.json({ tree: build(null, 0) })
  })
  .get(
    '/api/v1/folders/:id/children',
    requireCapability('canView', (c) => ({
      type: 'folder',
      id: c.req.param('id'),
      tenantId: c.get('identity')!.tenantId,
    })),
    async (c) => {
      const id = c.get('identity')!
      const folderId = c.req.param('id')
      // Subfolders (direct children only)
      const subfolders = await c
        .get('deps')
        .db.select()
        .from(foldersTable)
        .where(
          and(
            eq(foldersTable.tenantId, id.tenantId),
            eq(foldersTable.parentId, folderId),
            eq(foldersTable.isDeleted, false),
          ),
        )
      // Workbooks directly inside this folder
      const workbooksInFolder = await c
        .get('deps')
        .db.select()
        .from(workbooksTable)
        .where(
          and(
            eq(workbooksTable.tenantId, id.tenantId),
            eq(workbooksTable.folderId, folderId),
            eq(workbooksTable.isDeleted, false),
          ),
        )
      return c.json({ folders: subfolders, workbooks: workbooksInFolder })
    },
  )
  .post('/api/v1/folders/batch', async (c) => {
    const id = c.get('identity')!
    const body = (await c.req.json()) as {
      op?: 'delete' | 'move' | 'restore'
      ids?: string[]
      newParentId?: string | null
    }
    if (!body.op || !Array.isArray(body.ids) || body.ids.length === 0) {
      return c.json({ error: 'op and ids (non-empty) required' }, 400)
    }
    if (body.ids.length > 100) {
      return c.json({ error: 'batch limit 100 folders per call' }, 400)
    }
    // Pre-flight: verify each target belongs to tenant + caller may act on it.
    const targets = await c
      .get('deps')
      .db.select()
      .from(foldersTable)
      .where(and(eq(foldersTable.tenantId, id.tenantId), inArray(foldersTable.id, body.ids)))
    if (targets.length !== body.ids.length) {
      return c.json({ error: 'some folder ids not found in tenant' }, 404)
    }
    const requiredCap: 'canEdit' | 'canDelete' = body.op === 'delete' ? 'canDelete' : 'canEdit'
    for (const t of targets) {
      const cap = await c.get('deps').permission.getCapabilities(id, {
        type: 'folder',
        id: t.id,
        tenantId: id.tenantId,
      })
      if (!cap[requiredCap]) {
        return c.json({ error: `forbidden on folder ${t.id}` }, 403)
      }
    }
    let ok = 0
    const errors: Array<{ id: string; message: string }> = []
    for (const t of targets) {
      try {
        if (body.op === 'delete') {
          await c.get('services').folders.softDelete({ tenantId: id.tenantId, id: t.id })
          void c.get('services').events.emit({
            tenantId: id.tenantId,
            actorId: id.userId,
            type: 'folder.deleted',
            resourceId: t.id,
          })
        } else if (body.op === 'restore') {
          await c.get('services').folders.restore({ tenantId: id.tenantId, id: t.id })
          void c.get('services').events.emit({
            tenantId: id.tenantId,
            actorId: id.userId,
            type: 'folder.restored',
            resourceId: t.id,
          })
        } else if (body.op === 'move') {
          await c.get('services').folders.move({
            tenantId: id.tenantId,
            id: t.id,
            newParentId: body.newParentId ?? null,
          })
          void c.get('services').events.emit({
            tenantId: id.tenantId,
            actorId: id.userId,
            type: 'folder.moved',
            resourceId: t.id,
            extra: { fromParentId: t.parentId, toParentId: body.newParentId ?? null },
          })
        }
        ok++
      } catch (err) {
        errors.push({
          id: t.id,
          message: err instanceof Error ? err.message : String(err),
        })
      }
    }
    return c.json({ op: body.op, total: targets.length, ok, errors })
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
          await c.get('services').folders.listForTenant(id.tenantId, { includeDeleted: false })
        ).find((f) => f.id === folderId)

        const reordered = await c.get('services').folders.reorder({
          tenantId: id.tenantId,
          id: folderId,
          newPosition: body.newPosition,
          ...(body.newParentId !== undefined ? { newParentId: body.newParentId } : {}),
        })
        if (!reordered) return c.json({ error: 'not found' }, 404)
        if (body.newParentId !== undefined && before && before.parentId !== body.newParentId)
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
            await c.get('services').folders.listForTenant(id.tenantId, { includeDeleted: false })
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
      const cascade = c.req.query('cascade') === 'true'

      // Check for non-deleted subfolders / workbooks.
      const [subfolders, wbInside] = await Promise.all([
        c
          .get('deps')
          .db.select({ id: foldersTable.id })
          .from(foldersTable)
          .where(
            and(
              eq(foldersTable.tenantId, id.tenantId),
              eq(foldersTable.parentId, folderId),
              eq(foldersTable.isDeleted, false),
            ),
          ),
        c
          .get('deps')
          .db.select({ id: workbooksTable.id })
          .from(workbooksTable)
          .where(
            and(
              eq(workbooksTable.tenantId, id.tenantId),
              eq(workbooksTable.folderId, folderId),
              eq(workbooksTable.isDeleted, false),
            ),
          ),
      ])
      const subfolderCount = subfolders.length
      const workbookCount = wbInside.length
      const hasChildren = subfolderCount + workbookCount > 0

      if (hasChildren && !cascade) {
        return c.json(
          {
            error: 'folder has children; pass ?cascade=true to soft-delete recursively',
            code: 'has_children',
            subfolderCount,
            workbookCount,
          },
          409,
        )
      }

      if (cascade && hasChildren) {
        // Recursively soft-delete all descendant folders + workbooks.
        const allFolders = await c
          .get('services')
          .folders.listForTenant(id.tenantId, { includeDeleted: false })
        const childMap = new Map<string | null, string[]>()
        for (const f of allFolders) {
          const arr = childMap.get(f.parentId) ?? []
          arr.push(f.id)
          childMap.set(f.parentId, arr)
        }
        const descendantFolderIds: string[] = []
        const stack = [folderId]
        while (stack.length) {
          const cur = stack.pop()!
          for (const childId of childMap.get(cur) ?? []) {
            descendantFolderIds.push(childId)
            stack.push(childId)
          }
        }
        // Soft-delete descendant folders
        for (const fId of descendantFolderIds) {
          await c.get('services').folders.softDelete({ tenantId: id.tenantId, id: fId })
          void c.get('services').events.emit({
            tenantId: id.tenantId,
            actorId: id.userId,
            type: 'folder.deleted',
            resourceId: fId,
          })
        }
        // Soft-delete workbooks inside any descendant folder + the folder itself
        const allFolderIds = [folderId, ...descendantFolderIds]
        await c
          .get('deps')
          .db.update(workbooksTable)
          .set({ isDeleted: true, deletedAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(workbooksTable.tenantId, id.tenantId),
              inArray(workbooksTable.folderId, allFolderIds),
            ),
          )
      }

      await c.get('services').folders.softDelete({ tenantId: id.tenantId, id: folderId })
      void c.get('services').events.emit({
        tenantId: id.tenantId,
        actorId: id.userId,
        type: 'folder.deleted',
        resourceId: folderId,
        ...(cascade ? { extra: { cascade: true } } : {}),
      })
      return c.body(null, 204)
    },
  )
