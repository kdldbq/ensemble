import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { snapshots as snapshotsTable } from '../../db/schema'
import { type WorkbookData, applyMaskRules } from '../../services/mask-service'
import { diffSnapshots } from '../../services/version-diff'
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
      tenantId: c.get('identity')!.tenantId,
    })),
    async (c) => c.json({ items: await c.get('services').versions.listNamed(c.req.param('wbId')) }),
  )
  .post(
    '/api/v1/workbooks/:wbId/versions',
    requireCapability('canEdit', (c) => ({
      type: 'workbook',
      id: c.req.param('wbId'),
      tenantId: c.get('identity')!.tenantId,
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
    '/api/v1/workbooks/:wbId/versions/diff',
    requireCapability('canView', (c) => ({
      type: 'workbook',
      id: c.req.param('wbId'),
      tenantId: c.get('identity')!.tenantId,
    })),
    async (c) => {
      const wbId = c.req.param('wbId')
      const body = (await c.req.json()) as { fromVersionId?: string; toVersionId?: string }
      if (!body.fromVersionId || !body.toVersionId) {
        return c.json({ error: 'fromVersionId and toVersionId required' }, 400)
      }
      const [vA] = await c
        .get('deps')
        .db.select()
        .from(snapshotsTable)
        .where(eq(snapshotsTable.id, body.fromVersionId))
        .limit(1)
      const [vB] = await c
        .get('deps')
        .db.select()
        .from(snapshotsTable)
        .where(eq(snapshotsTable.id, body.toVersionId))
        .limit(1)
      if (!vA || !vB) return c.json({ error: 'one or both versions not found' }, 404)
      if (vA.workbookId !== wbId || vB.workbookId !== wbId) {
        return c.json({ error: 'version does not belong to this workbook' }, 400)
      }
      try {
        const [bytesA, bytesB] = await Promise.all([
          c.get('deps').storage.get(vA.storageKey),
          c.get('deps').storage.get(vB.storageKey),
        ])
        const aRaw = JSON.parse(new TextDecoder().decode(bytesA)) as WorkbookData
        const bRaw = JSON.parse(new TextDecoder().decode(bytesB)) as WorkbookData
        // 4.5: re-apply current mask rules before diffing. Without this, a
        // viewer-with-restricted-cells could compute the diff and recover
        // values that mask normally hides. Mask is the floor — never the
        // historical snapshot's original mask.
        const idCtx = c.get('identity')!
        const rules = await c.get('services').masks.get(idCtx, wbId)
        const a = rules.length > 0 ? applyMaskRules(aRaw, rules) : aRaw
        const b = rules.length > 0 ? applyMaskRules(bRaw, rules) : bRaw
        const diff = diffSnapshots(a, b)
        return c.json(diff)
      } catch (err) {
        return c.json({ error: err instanceof Error ? err.message : 'diff failed' }, 500)
      }
    },
  )
  .post(
    '/api/v1/workbooks/:wbId/restore/:versionId',
    requireCapability('canEdit', (c) => ({
      type: 'workbook',
      id: c.req.param('wbId'),
      tenantId: c.get('identity')!.tenantId,
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
