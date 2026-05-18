// biome-ignore-all lint/style/noNonNullAssertion: c.get(...) values are narrowed by the requireIdentity / requireCapability middleware that runs before every handler in this file; Biome cannot see the cross-middleware invariant.
import { and, count, countDistinct, desc, eq, gte, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { auditLog, folders, snapshots, workbooks } from '../../db/schema'
import type { AppEnv } from '../app'
import { requireIdentity } from '../auth'

export const adminRoute = new Hono<AppEnv>()
  .use('*', requireIdentity)
  /**
   * Per-tenant usage aggregates for an admin dashboard. Tenant-scoped only;
   * row-level security ensures cross-tenant leak is impossible. Host can
   * gate further (e.g., require an "isOrgAdmin" flag) by wrapping this route.
   */
  .get('/api/v1/admin/stats', async (c) => {
    const id = c.get('identity')!
    const db = c.get('deps').db

    const now = Date.now()
    const since24h = new Date(now - 24 * 60 * 60 * 1000)
    const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000)
    const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000)

    const [workbookCountRow] = await db
      .select({ c: count() })
      .from(workbooks)
      .where(and(eq(workbooks.tenantId, id.tenantId), eq(workbooks.isDeleted, false)))

    const [folderCountRow] = await db
      .select({ c: count() })
      .from(folders)
      .where(and(eq(folders.tenantId, id.tenantId), eq(folders.isDeleted, false)))

    const [snapshotsRow] = await db
      .select({
        c: count(),
        totalBytes: sql<number>`coalesce(sum(${snapshots.sizeBytes}), 0)::bigint`,
      })
      .from(snapshots)
      .innerJoin(workbooks, eq(snapshots.workbookId, workbooks.id))
      .where(eq(workbooks.tenantId, id.tenantId))

    const [activeUsers24hRow] = await db
      .select({ c: countDistinct(auditLog.actorId) })
      .from(auditLog)
      .where(and(eq(auditLog.tenantId, id.tenantId), gte(auditLog.occurredAt, since24h)))

    const [activeUsers7dRow] = await db
      .select({ c: countDistinct(auditLog.actorId) })
      .from(auditLog)
      .where(and(eq(auditLog.tenantId, id.tenantId), gte(auditLog.occurredAt, since7d)))

    const [events24hRow] = await db
      .select({ c: count() })
      .from(auditLog)
      .where(and(eq(auditLog.tenantId, id.tenantId), gte(auditLog.occurredAt, since24h)))

    const eventsByType30d = await db
      .select({ eventType: auditLog.eventType, c: count() })
      .from(auditLog)
      .where(and(eq(auditLog.tenantId, id.tenantId), gte(auditLog.occurredAt, since30d)))
      .groupBy(auditLog.eventType)
      .orderBy(desc(count()))

    const topUsers7d = await db
      .select({ actorId: auditLog.actorId, c: count() })
      .from(auditLog)
      .where(and(eq(auditLog.tenantId, id.tenantId), gte(auditLog.occurredAt, since7d)))
      .groupBy(auditLog.actorId)
      .orderBy(desc(count()))
      .limit(10)

    return c.json({
      tenantId: id.tenantId,
      generatedAt: new Date().toISOString(),
      workbooks: workbookCountRow?.c ?? 0,
      folders: folderCountRow?.c ?? 0,
      snapshots: snapshotsRow?.c ?? 0,
      storageBytes: snapshotsRow?.totalBytes ?? 0,
      activeUsers24h: activeUsers24hRow?.c ?? 0,
      activeUsers7d: activeUsers7dRow?.c ?? 0,
      events24h: events24hRow?.c ?? 0,
      eventsByType30d: eventsByType30d.map((r) => ({ eventType: r.eventType, count: r.c })),
      topActors7d: topUsers7d.map((r) => ({ actorId: r.actorId, count: r.c })),
    })
  })
  /**
   * List live WS sessions in the caller's tenant. Returns an empty list when
   * the host did not wire `deps.sessionRegistry` (vs. 503) so a dashboard can
   * render against servers that lack live-session inspection.
   */
  .get('/api/v1/admin/sessions', (c) => {
    const id = c.get('identity')
    if (!id) return c.json({ error: 'unauthorized' }, 401)
    const reg = c.get('deps').sessionRegistry
    if (!reg) return c.json({ sessions: [] })
    return c.json({
      sessions: reg.list(id.tenantId).map((h) => ({
        sessionId: h.sessionId,
        userId: h.userId,
        workbookId: h.workbookId,
        openedAt: h.openedAt.toISOString(),
      })),
    })
  })
  /**
   * Force-close a single WS session. Returns:
   *   - 204 on success
   *   - 404 for unknown ids OR sessions belonging to a different tenant
   *     (cross-tenant existence is not leaked)
   *   - 503 when sessionRegistry is not configured on this server
   *
   * Hosts may layer additional admin-role enforcement by wrapping this route.
   */
  .post('/api/v1/admin/sessions/:id/kick', (c) => {
    const id = c.get('identity')
    if (!id) return c.json({ error: 'unauthorized' }, 401)
    const reg = c.get('deps').sessionRegistry
    if (!reg) {
      return c.json(
        { error: 'session registry is not configured on this server', code: 'no_registry' },
        503,
      )
    }
    const ok = reg.kick(c.req.param('id'), id.tenantId)
    if (!ok) return c.json({ error: 'session not found' }, 404)
    return c.body(null, 204)
  })
