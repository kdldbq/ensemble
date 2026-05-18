import { and, eq } from 'drizzle-orm'
import type { Database } from '../db/client'
import { rangeProtections } from '../db/schema'

export interface ProtectionInput {
  tenantId: string
  workbookId: string
  sheetId: string
  rangeRef: string
  description?: string | null
  allowedUserIds?: string[] | null
  allowedRoles?: string[] | null
  createdBy: string
}

export interface Protection {
  id: string
  tenantId: string
  workbookId: string
  sheetId: string
  rangeRef: string
  description: string | null
  allowedUserIds: string[] | null
  allowedRoles: string[] | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

function toProtection(row: typeof rangeProtections.$inferSelect): Protection {
  return {
    id: row.id,
    tenantId: row.tenantId,
    workbookId: row.workbookId,
    sheetId: row.sheetId,
    rangeRef: row.rangeRef,
    description: row.description,
    allowedUserIds: row.allowedUserIds,
    allowedRoles: row.allowedRoles,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function createProtectionService(db: Database) {
  return {
    async create(input: ProtectionInput): Promise<Protection> {
      const [row] = await db
        .insert(rangeProtections)
        .values({
          tenantId: input.tenantId,
          workbookId: input.workbookId,
          sheetId: input.sheetId,
          rangeRef: input.rangeRef,
          description: input.description ?? null,
          allowedUserIds: input.allowedUserIds ?? null,
          allowedRoles: input.allowedRoles ?? null,
          createdBy: input.createdBy,
        })
        .returning()
      if (!row) throw new Error('range_protection insert returned no row')
      return toProtection(row)
    },

    async listForWorkbook(tenantId: string, workbookId: string): Promise<Protection[]> {
      const rows = await db
        .select()
        .from(rangeProtections)
        .where(
          and(eq(rangeProtections.tenantId, tenantId), eq(rangeProtections.workbookId, workbookId)),
        )
      return rows.map(toProtection)
    },

    async delete(input: { tenantId: string; id: string }): Promise<boolean> {
      const res = await db
        .delete(rangeProtections)
        .where(
          and(eq(rangeProtections.id, input.id), eq(rangeProtections.tenantId, input.tenantId)),
        )
        .returning({ id: rangeProtections.id })
      return res.length > 0
    },

    /**
     * Check whether userId (with role list) may edit a given range.
     * Returns true if no protections cover the range OR if user/roles match
     * an allow list. Currently uses string-equal range match — host can expand
     * to A1 range arithmetic later.
     */
    async canEdit(input: {
      tenantId: string
      workbookId: string
      sheetId: string
      rangeRef: string
      userId: string
      roles?: string[]
    }): Promise<boolean> {
      const protections = await db
        .select()
        .from(rangeProtections)
        .where(
          and(
            eq(rangeProtections.tenantId, input.tenantId),
            eq(rangeProtections.workbookId, input.workbookId),
            eq(rangeProtections.sheetId, input.sheetId),
            eq(rangeProtections.rangeRef, input.rangeRef),
          ),
        )
      if (protections.length === 0) return true
      for (const p of protections) {
        const userMatch = p.allowedUserIds === null || p.allowedUserIds.includes(input.userId)
        const roleMatch =
          p.allowedRoles === null || (input.roles ?? []).some((r) => p.allowedRoles?.includes(r))
        if (userMatch && roleMatch) return true
      }
      return false
    },
  }
}

export type ProtectionService = ReturnType<typeof createProtectionService>
