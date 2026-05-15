import { and, eq } from 'drizzle-orm'
import type { Database } from '../db/client'
import { workbooks } from '../db/schema'

export interface CreateInput { tenantId: string; userId: string; name: string; folderId?: string }
export interface RefInput { tenantId: string; id: string }

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
        .where(and(eq(workbooks.id, input.id), eq(workbooks.tenantId, input.tenantId), eq(workbooks.isDeleted, false)))
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
        .set({ isDeleted: true, updatedAt: new Date() })
        .where(and(eq(workbooks.id, input.id), eq(workbooks.tenantId, input.tenantId)))
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
