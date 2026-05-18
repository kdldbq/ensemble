// biome-ignore-all lint/style/noNonNullAssertion: c.get(...) values are narrowed by the requireIdentity / requireCapability middleware that runs before every handler in this file; Biome cannot see the cross-middleware invariant.
import { Hono } from 'hono'
import type { AppEnv } from '../app'
import { requireIdentity } from '../auth'
import { requireCapability } from '../permission'

export const activityRoute = new Hono<AppEnv>()
  .use('*', requireIdentity)
  .get(
    '/api/v1/workbooks/:id/activity',
    requireCapability('canView', (c) => ({
      type: 'workbook',
      id: c.req.param('id'),
      tenantId: c.get('identity')!.tenantId,
    })),
    async (c) => {
      const id = c.get('identity')!
      const wbId = c.req.param('id')
      const limit = Number(c.req.query('limit') ?? '50')
      const before = c.req.query('before') ?? undefined
      const items = await c.get('services').activity.list({
        tenantId: id.tenantId,
        workbookId: wbId,
        limit: Number.isFinite(limit) ? limit : 50,
        ...(before ? { before } : {}),
      })
      return c.json({ items })
    },
  )
  .get('/api/v1/activity', async (c) => {
    const id = c.get('identity')!
    const limit = Number(c.req.query('limit') ?? '50')
    const before = c.req.query('before') ?? undefined
    const items = await c.get('services').activity.list({
      tenantId: id.tenantId,
      limit: Number.isFinite(limit) ? limit : 50,
      ...(before ? { before } : {}),
    })
    return c.json({ items })
  })
