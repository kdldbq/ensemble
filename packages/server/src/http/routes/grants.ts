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
      return c.json(row, 201)
    }
  )
  .delete('/api/v1/grants/:id', async (c) => {
    const idCtx = c.get('identity')!
    await c.get('deps').db.delete(shareGrants)
      .where(and(eq(shareGrants.id, c.req.param('id')), eq(shareGrants.tenantId, idCtx.tenantId)))
    return c.body(null, 204)
  })
