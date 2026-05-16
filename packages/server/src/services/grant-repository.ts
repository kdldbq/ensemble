import { and, eq, inArray, or, sql } from 'drizzle-orm'
import type { Database } from '../db/client'
import { shareGrants } from '../db/schema'
import type { Grant } from './grant-service'

/**
 * Warn if app.tenant_id is unset.
 *
 * Under the app_user connection, unset app.tenant_id makes every RLS USING
 * clause evaluate to false → silent zero rows. Surface that misuse via warn
 * (not throw, because superuser test fixtures legitimately bypass RLS).
 */
async function warnIfNoTenantContext(db: Database, op: string): Promise<void> {
  try {
    const rows = await db.execute<{ ctx: string | null }>(
      sql`SELECT current_setting('app.tenant_id', true) AS ctx`,
    )
    if (!rows[0]?.ctx) {
      console.warn(
        `grant-repository: ${op} called without app.tenant_id — RLS will silently return 0 rows. Wrap in withTenant().`,
      )
    }
  } catch {
    /* diagnostic only */
  }
}

/**
 * Repository over share_grants and folders.
 *
 * **Must be called inside withTenant(tenantId, ...)** when running under the
 * app_user (non-superuser) connection; otherwise RLS policies silently
 * return empty. Test fixtures using superuser db bypass RLS legitimately.
 */
export function createGrantRepository(db: Database) {
  return {
    async folderAncestors(folderId: string): Promise<string[]> {
      await warnIfNoTenantContext(db, 'folderAncestors')
      const rows = await db.execute<{ id: string }>(sql`
        WITH RECURSIVE chain AS (
          SELECT id, parent_id FROM folders WHERE id = ${folderId} AND is_deleted = false
          UNION ALL
          SELECT f.id, f.parent_id FROM folders f INNER JOIN chain c ON f.id = c.parent_id
          WHERE f.is_deleted = false
        )
        SELECT id FROM chain
      `)
      return rows.map((r) => r.id)
    },

    async findGrants(
      refs: Array<{ resourceType: 'folder' | 'workbook'; resourceId: string }>,
    ): Promise<Grant[]> {
      await warnIfNoTenantContext(db, 'findGrants')
      if (refs.length === 0) return []
      const folderIds = refs.filter((r) => r.resourceType === 'folder').map((r) => r.resourceId)
      const workbookIds = refs.filter((r) => r.resourceType === 'workbook').map((r) => r.resourceId)
      const conditions = []
      if (folderIds.length) {
        conditions.push(
          and(eq(shareGrants.resourceType, 'folder'), inArray(shareGrants.resourceId, folderIds)),
        )
      }
      if (workbookIds.length) {
        conditions.push(
          and(
            eq(shareGrants.resourceType, 'workbook'),
            inArray(shareGrants.resourceId, workbookIds),
          ),
        )
      }
      if (conditions.length === 0) return []
      const rows = await db
        .select()
        .from(shareGrants)
        .where(or(...conditions))
      return rows.map((r) => ({
        resourceType: r.resourceType,
        resourceId: r.resourceId,
        granteeType: r.granteeType,
        granteeId: r.granteeId,
        permission: r.permission,
        expiresAt: r.expiresAt,
      }))
    },
  }
}

export type GrantRepository = ReturnType<typeof createGrantRepository>
