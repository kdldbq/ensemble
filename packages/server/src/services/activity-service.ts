import { and, desc, eq, lt } from 'drizzle-orm'
import type { Database } from '../db/client'
import { auditLog } from '../db/schema'

export interface ActivityEntry {
  id: string
  eventType: string
  actorId: string
  resourceId: string | null
  payload: Record<string, unknown>
  occurredAt: string
}

export interface ListActivityOpts {
  tenantId: string
  /** When set, only events for this workbook resource id. */
  workbookId?: string
  /** Default 50, max 200. */
  limit?: number
  /** Cursor pagination: only rows older than this ISO timestamp. */
  before?: string
}

export function createActivityService(db: Database) {
  return {
    async list(opts: ListActivityOpts): Promise<ActivityEntry[]> {
      const lim = Math.max(1, Math.min(200, opts.limit ?? 50))
      const conds = [eq(auditLog.tenantId, opts.tenantId)]
      if (opts.workbookId) conds.push(eq(auditLog.resourceId, opts.workbookId))
      if (opts.before) conds.push(lt(auditLog.occurredAt, new Date(opts.before)))
      const rows = await db
        .select()
        .from(auditLog)
        .where(and(...conds))
        .orderBy(desc(auditLog.occurredAt))
        .limit(lim)
      return rows.map((r) => ({
        id: r.id.toString(),
        eventType: r.eventType,
        actorId: r.actorId,
        resourceId: r.resourceId ?? null,
        payload: (r.payload as Record<string, unknown> | null) ?? {},
        occurredAt: r.occurredAt.toISOString(),
      }))
    },
  }
}

export type ActivityService = ReturnType<typeof createActivityService>
