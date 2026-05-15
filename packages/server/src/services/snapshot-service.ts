import { desc, eq } from 'drizzle-orm'
import type { Database } from '../db/client'
import type { StorageAdapter } from '../adapters/storage'
import { snapshots } from '../db/schema'

export interface CreateSnapshotInput {
  tenantId: string
  workbookId: string
  userId: string
  body: Uint8Array
  reason: 'auto' | 'manual' | 'named'
  name?: string
}

export function createSnapshotService(db: Database, storage: StorageAdapter) {
  return {
    async create(input: CreateSnapshotInput) {
      const key = `tenants/${input.tenantId}/workbooks/${input.workbookId}/${Date.now()}-${crypto.randomUUID()}.json`
      await storage.put(key, input.body, { contentType: 'application/json' })
      const [row] = await db
        .insert(snapshots)
        .values({
          workbookId: input.workbookId,
          storageKey: key,
          sizeBytes: input.body.byteLength,
          createdBy: input.userId,
          reason: input.reason,
          name: input.name,
        })
        .returning()
      return row
    },
    async getById(id: string) {
      const rows = await db.select().from(snapshots).where(eq(snapshots.id, id)).limit(1)
      return rows[0] ?? null
    },
    async getLatest(workbookId: string) {
      const rows = await db
        .select()
        .from(snapshots)
        .where(eq(snapshots.workbookId, workbookId))
        .orderBy(desc(snapshots.createdAt))
        .limit(1)
      return rows[0] ?? null
    },
  }
}

export type SnapshotService = ReturnType<typeof createSnapshotService>
