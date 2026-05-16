import { Hono } from 'hono'
import type { AppEnv } from '../app'
import { requireIdentity } from '../auth'
import { requireCapability } from '../permission'

export const versionsRoute = new Hono<AppEnv>()
  .use('*', requireIdentity)
  .get(
    '/api/v1/workbooks/:wbId/versions',
    requireCapability('canView', (c) => ({
      type: 'workbook',
      id: c.req.param('wbId'),
      tenantId: c.get('identity')?.tenantId,
    })),
    async (c) => c.json({ items: await c.get('services').versions.listNamed(c.req.param('wbId')) }),
  )
  .post(
    '/api/v1/workbooks/:wbId/versions',
    requireCapability('canEdit', (c) => ({
      type: 'workbook',
      id: c.req.param('wbId'),
      tenantId: c.get('identity')?.tenantId,
    })),
    async (c) => {
      const idCtx = c.get('identity')!
      const body = (await c.req.json()) as { name?: string }
      if (!body.name) return c.json({ error: 'name required' }, 400)
      try {
        const row = await c.get('services').versions.createNamed({
          workbookId: c.req.param('wbId'),
          userId: idCtx.userId,
          name: body.name,
        })
        return c.json(row, 201)
      } catch (err) {
        if (err instanceof Error && /no snapshots/.test(err.message)) {
          return c.json({ error: 'cannot create version: workbook has no snapshots' }, 400)
        }
        throw err
      }
    },
  )
  .post(
    '/api/v1/workbooks/:wbId/restore/:versionId',
    requireCapability('canEdit', (c) => ({
      type: 'workbook',
      id: c.req.param('wbId'),
      tenantId: c.get('identity')?.tenantId,
    })),
    async (c) => {
      const idCtx = c.get('identity')!
      try {
        const row = await c.get('services').versions.restore({
          workbookId: c.req.param('wbId'),
          versionId: c.req.param('versionId'),
          userId: idCtx.userId,
        })
        return c.json(row, 201)
      } catch (err) {
        if (err instanceof Error && /not found/.test(err.message)) {
          return c.json({ error: 'version not found' }, 404)
        }
        throw err
      }
    },
  )
