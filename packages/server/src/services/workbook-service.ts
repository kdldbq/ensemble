import { and, eq } from 'drizzle-orm'
import type { Database } from '../db/client'
import { workbooks } from '../db/schema'

export interface CreateInput {
  tenantId: string
  userId: string
  name: string
  folderId?: string
}
export interface RefInput {
  tenantId: string
  id: string
}

export function createWorkbookService(db: Database) {
  return {
    async create(input: CreateInput) {
      const [row] = await db
        .insert(workbooks)
        .values({
          tenantId: input.tenantId,
          ownerId: input.userId,
          name: input.name,
          ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
        })
        .returning()
      return row
    },
    async get(input: RefInput) {
      const rows = await db
        .select()
        .from(workbooks)
        .where(
          and(
            eq(workbooks.id, input.id),
            eq(workbooks.tenantId, input.tenantId),
            eq(workbooks.isDeleted, false),
          ),
        )
        .limit(1)
      return rows[0] ?? null
    },
    async listForTenant(tenantId: string) {
      return db
        .select()
        .from(workbooks)
        .where(and(eq(workbooks.tenantId, tenantId), eq(workbooks.isDeleted, false)))
    },
    async softDelete(input: RefInput) {
      await db
        .update(workbooks)
        .set({ isDeleted: true, deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(workbooks.id, input.id), eq(workbooks.tenantId, input.tenantId)))
    },
    async update(
      input: RefInput & { name?: string; folderId?: string | null },
    ): Promise<typeof workbooks.$inferSelect | null> {
      const patch: Partial<typeof workbooks.$inferInsert> = { updatedAt: new Date() }
      if (input.name !== undefined) {
        const trimmed = input.name.trim()
        if (trimmed.length === 0 || trimmed.length > 256) return null
        patch.name = trimmed
      }
      if (input.folderId !== undefined) {
        patch.folderId = input.folderId
      }
      const [row] = await db
        .update(workbooks)
        .set(patch)
        .where(and(eq(workbooks.id, input.id), eq(workbooks.tenantId, input.tenantId)))
        .returning()
      return row ?? null
    },
    async setCurrentSnapshot(input: RefInput & { snapshotId: string }) {
      await db
        .update(workbooks)
        .set({ currentSnapshotId: input.snapshotId, updatedAt: new Date() })
        .where(and(eq(workbooks.id, input.id), eq(workbooks.tenantId, input.tenantId)))
    },
  }
}

export type WorkbookService = ReturnType<typeof createWorkbookService>
