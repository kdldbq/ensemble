import { Hono } from 'hono'
import type { AppEnv } from '../app'
import { requireIdentity } from '../auth'
import { requireCapability } from '../permission'

export const protectionsRoute = new Hono<AppEnv>()
  .use('*', requireIdentity)
  .get(
    '/api/v1/workbooks/:id/protections',
    requireCapability('canView', (c) => ({
      type: 'workbook',
      id: c.req.param('id'),
      tenantId: c.get('identity')!.tenantId,
    })),
    async (c) => {
      const id = c.get('identity')!
      const wbId = c.req.param('id')
      const items = await c.get('services').protection.listForWorkbook(id.tenantId, wbId)
      return c.json({ items })
    },
  )
  .post(
    '/api/v1/workbooks/:id/protections',
    requireCapability('canShare', (c) => ({
      type: 'workbook',
      id: c.req.param('id'),
      tenantId: c.get('identity')!.tenantId,
    })),
    async (c) => {
      const id = c.get('identity')!
      const wbId = c.req.param('id')
      const body = (await c.req.json()) as {
        sheetId?: string
        rangeRef?: string
        description?: string | null
        allowedUserIds?: string[] | null
        allowedRoles?: string[] | null
      }
      if (!body.sheetId || !body.rangeRef) {
        return c.json({ error: 'sheetId and rangeRef required' }, 400)
      }
      const created = await c.get('services').protection.create({
        tenantId: id.tenantId,
        workbookId: wbId,
        sheetId: body.sheetId,
        rangeRef: body.rangeRef,
        description: body.description ?? null,
        allowedUserIds: body.allowedUserIds ?? null,
        allowedRoles: body.allowedRoles ?? null,
        createdBy: id.userId,
      })
      void c.get('services').events.emit({
        tenantId: id.tenantId,
        actorId: id.userId,
        type: 'protection.created',
        resourceId: created.id,
        extra: { workbookId: wbId, rangeRef: created.rangeRef },
      })
      return c.json(created, 201)
    },
  )
  .delete(
    '/api/v1/workbooks/:wbId/protections/:id',
    requireCapability('canShare', (c) => ({
      type: 'workbook',
      id: c.req.param('wbId'),
      tenantId: c.get('identity')!.tenantId,
    })),
    async (c) => {
      const id = c.get('identity')!
      const wbId = c.req.param('wbId')
      const protectionId = c.req.param('id')
      const ok = await c.get('services').protection.delete({
        tenantId: id.tenantId,
        id: protectionId,
      })
      if (!ok) return c.json({ error: 'not found' }, 404)
      void c.get('services').events.emit({
        tenantId: id.tenantId,
        actorId: id.userId,
        type: 'protection.deleted',
        resourceId: protectionId,
        extra: { workbookId: wbId },
      })
      return c.body(null, 204)
    },
  )
