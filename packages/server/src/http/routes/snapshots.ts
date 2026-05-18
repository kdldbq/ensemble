// biome-ignore-all lint/style/noNonNullAssertion: c.get(...) values are narrowed by the requireIdentity / requireCapability middleware that runs before every handler in this file; Biome cannot see the cross-middleware invariant.
import { Hono } from 'hono'
import { applyMaskRules } from '../../services/mask-service'
import type { AppEnv } from '../app'
import { requireIdentity } from '../auth'
import { requireCapability } from '../permission'

export const snapshotsRoute = new Hono<AppEnv>()
  .use('*', requireIdentity)
  .post(
    '/api/v1/workbooks/:wbId/snapshots',
    requireCapability('canEdit', (c) => ({
      type: 'workbook',
      id: c.req.param('wbId'),
      tenantId: c.get('identity')!.tenantId,
    })),
    async (c) => {
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
      void c.get('services').events.emit({
        tenantId: id.tenantId,
        actorId: id.userId,
        type: 'workbook.edited',
        resourceId: wbId,
        extra: { batchedOpsCount: 0 },
      })
      return c.json(snap, 201)
    },
  )
  .get(
    '/api/v1/workbooks/:wbId/snapshots/:id/blob',
    requireCapability('canView', (c) => ({
      type: 'workbook',
      id: c.req.param('wbId'),
      tenantId: c.get('identity')!.tenantId,
    })),
    async (c) => {
      const { storage } = c.get('deps')
      const idCtx = c.get('identity')!
      const { workbooks: wbSvc, snapshots: snapSvc, masks } = c.get('services')
      const wb = await wbSvc.get({ tenantId: idCtx.tenantId, id: c.req.param('wbId') })
      if (!wb) return c.json({ error: 'not found' }, 404)
      const snap = await snapSvc.getById(c.req.param('id'))
      if (!snap) return c.json({ error: 'not found' }, 404)
      if (snap.workbookId !== c.req.param('wbId')) return c.json({ error: 'not found' }, 404)
      const bytes = await storage.get(snap.storageKey)
      const rules = await masks.get(idCtx, wb.id)
      if (rules.length === 0) return c.body(bytes, 200, { 'content-type': 'application/json' })
      const data = JSON.parse(new TextDecoder().decode(bytes)) as Parameters<
        typeof applyMaskRules
      >[0]
      return c.json(applyMaskRules(data, rules))
    },
  )
  .get(
    '/api/v1/workbooks/:wbId/snapshot',
    requireCapability('canView', (c) => ({
      type: 'workbook',
      id: c.req.param('wbId'),
      tenantId: c.get('identity')!.tenantId,
    })),
    async (c) => {
      const { storage } = c.get('deps')
      const idCtx = c.get('identity')!
      const { workbooks: wbSvc, snapshots: snapSvc, masks } = c.get('services')
      const wb = await wbSvc.get({ tenantId: idCtx.tenantId, id: c.req.param('wbId') })
      if (!wb) return c.json({ error: 'not found' }, 404)
      const snap = await snapSvc.getLatest(wb.id)
      if (!snap) return c.body(null, 204)
      const bytes = await storage.get(snap.storageKey)
      const rules = await masks.get(idCtx, wb.id)
      if (rules.length === 0) return c.body(bytes, 200, { 'content-type': 'application/json' })
      const data = JSON.parse(new TextDecoder().decode(bytes)) as Parameters<
        typeof applyMaskRules
      >[0]
      return c.json(applyMaskRules(data, rules))
    },
  )
