import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { shareGrants } from '../../db/schema'
import { clientIpFromHeaders, ipMatches } from '../../services/ip-allowlist'
import { hashPassword, verifyPassword } from '../../services/password'
import type { AppEnv } from '../app'
import { requireIdentity } from '../auth'
import { requireCapability } from '../permission'

export type GrantBody = {
  resourceType: 'folder' | 'workbook'
  resourceId: string
  granteeType: 'user' | 'tenant_member' | 'public_link'
  granteeId?: string
  permission: 'view' | 'edit' | 'manage'
  expiresAt?: string
  /** Optional password for public_link grants. Stored as scrypt hash. */
  password?: string
  /**
   * Optional IP / CIDR allowlist (public_link only).
   * Examples: ["10.0.0.0/8"] | ["203.0.113.5", "2001:db8::/32"]
   */
  allowedIps?: string[]
}

export const grantsRoute = new Hono<AppEnv>()
  .use('*', requireIdentity)
  .use('/api/v1/grants', async (c, next) => {
    if (c.req.method === 'POST') {
      const body = (await c.req.json()) as GrantBody
      c.set('grantBody', body)
    }
    await next()
  })
  .get('/api/v1/grants', async (c) => {
    const id = c.get('identity')!
    const workbookId = c.req.query('workbookId')
    const folderId = c.req.query('folderId')
    const conds = [eq(shareGrants.tenantId, id.tenantId)]
    if (workbookId) {
      conds.push(eq(shareGrants.resourceType, 'workbook'))
      conds.push(eq(shareGrants.resourceId, workbookId))
    } else if (folderId) {
      conds.push(eq(shareGrants.resourceType, 'folder'))
      conds.push(eq(shareGrants.resourceId, folderId))
    } else {
      return c.json({ error: 'workbookId or folderId required' }, 400)
    }
    const rows = await c
      .get('deps')
      .db.select()
      .from(shareGrants)
      .where(and(...conds))
    const items = rows.map(({ passwordHash, ...rest }) => ({
      ...rest,
      hasPassword: passwordHash != null && passwordHash !== '',
    }))
    return c.json({ items })
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
      let passwordHash: string | null = null
      if (body.password !== undefined && body.password !== '') {
        if (body.granteeType !== 'public_link') {
          return c.json({ error: 'password only valid for public_link grants' }, 400)
        }
        try {
          passwordHash = await hashPassword(body.password)
        } catch (err) {
          return c.json({ error: err instanceof Error ? err.message : 'bad password' }, 400)
        }
      }
      if (body.allowedIps !== undefined && body.granteeType !== 'public_link') {
        return c.json({ error: 'allowedIps only valid for public_link grants' }, 400)
      }
      const [row] = await c
        .get('deps')
        .db.insert(shareGrants)
        .values({
          tenantId: id.tenantId,
          resourceType: body.resourceType,
          resourceId: body.resourceId,
          granteeType: body.granteeType,
          granteeId: body.granteeId ?? null,
          permission: body.permission,
          grantedBy: id.userId,
          ...(body.expiresAt ? { expiresAt: new Date(body.expiresAt) } : {}),
          ...(passwordHash ? { passwordHash } : {}),
          ...(body.allowedIps && body.allowedIps.length > 0
            ? { allowedIps: body.allowedIps }
            : {}),
        })
        .returning()
      if (!row) throw new Error('insert returned no row')
      void c.get('services').events.emit({
        tenantId: id.tenantId,
        actorId: id.userId,
        type: 'share.granted',
        resourceId: row.id,
      })
      const { passwordHash: _h, ...safe } = row
      return c.json({ ...safe, hasPassword: passwordHash != null }, 201)
    },
  )
  .post('/api/v1/grants/:id/verify', async (c) => {
    const id = c.get('identity')!
    const body = (await c.req.json()) as { password?: string }
    const [row] = await c
      .get('deps')
      .db.select()
      .from(shareGrants)
      .where(and(eq(shareGrants.id, c.req.param('id')), eq(shareGrants.tenantId, id.tenantId)))
      .limit(1)
    if (!row) return c.json({ error: 'not found' }, 404)

    // 1. IP allowlist check (D3) — applies before password.
    if (row.allowedIps && row.allowedIps.length > 0) {
      const clientIp = clientIpFromHeaders(c.req.raw.headers)
      if (!clientIp || !ipMatches(clientIp, row.allowedIps)) {
        return c.json({ error: 'IP not in allowlist', code: 'ip_blocked' }, 403)
      }
    }

    // 2. Password check (existing D1 path).
    if (!row.passwordHash) return c.body(null, 204)
    if (!body.password) return c.json({ error: 'password required' }, 400)
    const ok = await verifyPassword(body.password, row.passwordHash)
    return ok ? c.body(null, 204) : c.json({ error: 'wrong password' }, 401)
  })
  .use('/api/v1/grants/:id', async (c, next) => {
    if (c.req.method === 'DELETE') {
      const idCtx = c.get('identity')!
      const [grant] = await c
        .get('deps')
        .db.select()
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
      const grantId = c.req.param('id')
      await c
        .get('deps')
        .db.delete(shareGrants)
        .where(and(eq(shareGrants.id, grantId), eq(shareGrants.tenantId, idCtx.tenantId)))
      void c.get('services').events.emit({
        tenantId: idCtx.tenantId,
        actorId: idCtx.userId,
        type: 'share.revoked',
        resourceId: grantId,
      })
      return c.body(null, 204)
    },
  )
