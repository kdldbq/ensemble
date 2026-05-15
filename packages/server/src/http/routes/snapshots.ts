import { Hono } from 'hono'
import { createSnapshotService } from '../../services/snapshot-service'
import { createWorkbookService } from '../../services/workbook-service'
import { requireIdentity } from '../auth'
import type { AppEnv } from '../app'

export const snapshotsRoute = new Hono<AppEnv>()
  .use('*', requireIdentity)
  .post('/api/v1/workbooks/:wbId/snapshots', async (c) => {
    const { db, storage } = c.get('deps')
    const id = c.get('identity')!
    const wbId = c.req.param('wbId')
    const wb = await createWorkbookService(db).get({ tenantId: id.tenantId, id: wbId })
    if (!wb) return c.json({ error: 'not found' }, 404)
    const body = new Uint8Array(await c.req.arrayBuffer())
    if (body.byteLength === 0) return c.json({ error: 'empty body' }, 400)
    const reason = (c.req.query('reason') ?? 'manual') as 'auto' | 'manual' | 'named'
    const name = c.req.query('name') ?? undefined
    const snap = await createSnapshotService(db, storage).create({
      tenantId: id.tenantId,
      workbookId: wbId,
      userId: id.userId,
      body,
      reason,
      name,
    })
    await createWorkbookService(db).setCurrentSnapshot({ tenantId: id.tenantId, id: wbId, snapshotId: snap.id })
    return c.json(snap, 201)
  })
  .get('/api/v1/workbooks/:wbId/snapshots/:id/blob', async (c) => {
    const { db, storage } = c.get('deps')
    const idCtx = c.get('identity')!
    const wb = await createWorkbookService(db).get({ tenantId: idCtx.tenantId, id: c.req.param('wbId') })
    if (!wb) return c.json({ error: 'not found' }, 404)
    const snap = await createSnapshotService(db, storage).getById(c.req.param('id'))
    if (!snap) return c.json({ error: 'not found' }, 404)
    const bytes = await storage.get(snap.storageKey)
    return c.body(bytes, 200, { 'content-type': 'application/json' })
  })
  .get('/api/v1/workbooks/:wbId/snapshot', async (c) => {
    const { db, storage } = c.get('deps')
    const idCtx = c.get('identity')!
    const wb = await createWorkbookService(db).get({ tenantId: idCtx.tenantId, id: c.req.param('wbId') })
    if (!wb) return c.json({ error: 'not found' }, 404)
    const snap = await createSnapshotService(db, storage).getLatest(wb.id)
    if (!snap) return c.body(null, 204)
    const bytes = await storage.get(snap.storageKey)
    return c.body(bytes, 200, { 'content-type': 'application/json' })
  })
