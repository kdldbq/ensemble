import { Hono } from 'hono'
import { requireIdentity } from '../auth'
import type { AppEnv } from '../app'

export const snapshotsRoute = new Hono<AppEnv>()
  .use('*', requireIdentity)
  .post('/api/v1/workbooks/:wbId/snapshots', async (c) => {
    const id = c.get('identity')!
    const wbId = c.req.param('wbId')
    const { workbooks: wbSvc, snapshots: snapSvc } = c.get('services')
    const wb = await wbSvc.get({ tenantId: id.tenantId, id: wbId })
    if (!wb) return c.json({ error: 'not found' }, 404)
    const body = new Uint8Array(await c.req.arrayBuffer())
    if (body.byteLength === 0) return c.json({ error: 'empty body' }, 400)
    const reason = (c.req.query('reason') ?? 'manual') as 'auto' | 'manual' | 'named'
    const name = c.req.query('name') ?? undefined
    const snap = await snapSvc.create({
      tenantId: id.tenantId,
      workbookId: wbId,
      userId: id.userId,
      body,
      reason,
      ...(name !== undefined ? { name } : {}),
    })
    if (!snap) return c.json({ error: 'snapshot creation failed' }, 500)
    await wbSvc.setCurrentSnapshot({ tenantId: id.tenantId, id: wbId, snapshotId: snap.id })
    return c.json(snap, 201)
  })
  .get('/api/v1/workbooks/:wbId/snapshots/:id/blob', async (c) => {
    const { storage } = c.get('deps')
    const idCtx = c.get('identity')!
    const { workbooks: wbSvc, snapshots: snapSvc } = c.get('services')
    const wb = await wbSvc.get({ tenantId: idCtx.tenantId, id: c.req.param('wbId') })
    if (!wb) return c.json({ error: 'not found' }, 404)
    const snap = await snapSvc.getById(c.req.param('id'))
    if (!snap) return c.json({ error: 'not found' }, 404)
    if (snap.workbookId !== c.req.param('wbId')) return c.json({ error: 'not found' }, 404)
    const bytes = await storage.get(snap.storageKey)
    return c.body(bytes, 200, { 'content-type': 'application/json' })
  })
  .get('/api/v1/workbooks/:wbId/snapshot', async (c) => {
    const { storage } = c.get('deps')
    const idCtx = c.get('identity')!
    const { workbooks: wbSvc, snapshots: snapSvc } = c.get('services')
    const wb = await wbSvc.get({ tenantId: idCtx.tenantId, id: c.req.param('wbId') })
    if (!wb) return c.json({ error: 'not found' }, 404)
    const snap = await snapSvc.getLatest(wb.id)
    if (!snap) return c.body(null, 204)
    const bytes = await storage.get(snap.storageKey)
    return c.body(bytes, 200, { 'content-type': 'application/json' })
  })
