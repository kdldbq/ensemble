import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { requireIdentity } from '../auth'
import { requireCapability } from '../permission'
import { shareGrants } from '../../db/schema'
import type { AppEnv } from '../app'

export type GrantBody = {
  resourceType: 'folder' | 'workbook'
  resourceId: string
  granteeType: 'user' | 'tenant_member' | 'public_link'
  granteeId?: string
  permission: 'view' | 'edit' | 'manage'
  expiresAt?: string
}

export const grantsRoute = new Hono<AppEnv>()
  .use('*', requireIdentity)
  // Pre-middleware to parse body once and stash for requireCapability + handler
  .use('/api/v1/grants', async (c, next) => {
    if (c.req.method === 'POST') {
      const body = (await c.req.json()) as GrantBody
      c.set('grantBody', body)
    }
    await next()
  })
  .post(
    '/api/v1/grants',
    requireCapability('canShare', (c) => {
      const body = c.get('grantBody')
      if (!body) throw new Error('grantBody missing')
      return { type: body.resourceType, id: body.resourceId, tenantId: c.get('identity')!.tenantId }
    }),
    async (c) => {
      const id = c.get('identity')!
      const body = c.get('grantBody')!
      const [row] = await c.get('deps').db.insert(shareGrants).values({
        tenantId: id.tenantId,
        resourceType: body.resourceType,
        resourceId: body.resourceId,
        granteeType: body.granteeType,
        granteeId: body.granteeId ?? null,
        permission: body.permission,
        grantedBy: id.userId,
        ...(body.expiresAt ? { expiresAt: new Date(body.expiresAt) } : {}),
      }).returning()
      if (!row) throw new Error('insert returned no row')
      void c.get('services').events.emit({ tenantId: id.tenantId, actorId: id.userId, type: 'share.granted', resourceId: row.id })
      return c.json(row, 201)
    }
  )
  // Pre-middleware: fetch grant row by id so requireCapability can inspect the resource
  .use('/api/v1/grants/:id', async (c, next) => {
    if (c.req.method === 'DELETE') {
      const idCtx = c.get('identity')!
      const [grant] = await c.get('deps').db
        .select()
        .from(shareGrants)
        .where(and(eq(shareGrants.id, c.req.param('id')), eq(shareGrants.tenantId, idCtx.tenantId)))
        .limit(1)
      if (!grant) return c.json({ error: 'not found' }, 404)
      c.set('grantToDelete', grant)
    }
    await next()
  })
  .delete(
    '/api/v1/grants/:id',
    requireCapability('canShare', (c) => {
      const g = c.get('grantToDelete')!
      return { type: g.resourceType, id: g.resourceId, tenantId: c.get('identity')!.tenantId }
    }),
    async (c) => {
      const idCtx = c.get('identity')!
      await c.get('deps').db.delete(shareGrants)
        .where(and(eq(shareGrants.id, c.req.param('id')), eq(shareGrants.tenantId, idCtx.tenantId)))
      return c.body(null, 204)
    }
  )
