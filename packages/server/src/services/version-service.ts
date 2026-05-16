import { and, desc, eq } from 'drizzle-orm'
import type { Database } from '../db/client'
import { snapshots, workbooks } from '../db/schema'
import type { SnapshotService } from './snapshot-service'

export interface ListNamedRow {
  id: string
  workbookId: string
  name: string
  createdBy: string
  createdAt: Date
}

export function createVersionService(db: Database, snapSvc: SnapshotService) {
  return {
    async listNamed(workbookId: string): Promise<ListNamedRow[]> {
      const rows = await db
        .select({
          id: snapshots.id,
          workbookId: snapshots.workbookId,
          name: snapshots.name,
          createdBy: snapshots.createdBy,
          createdAt: snapshots.createdAt,
        })
        .from(snapshots)
        .where(and(eq(snapshots.workbookId, workbookId), eq(snapshots.reason, 'named')))
        .orderBy(desc(snapshots.createdAt))
      return rows
        .filter((r) => r.name !== null)
        .map((r) => ({
          id: r.id,
          workbookId: r.workbookId,
          name: r.name as string,
          createdBy: r.createdBy,
          createdAt: r.createdAt,
        }))
    },

    async createNamed(input: { workbookId: string; userId: string; name: string }) {
      const latest = await snapSvc.getLatest(input.workbookId)
      if (!latest) throw new Error('cannot create version: no snapshots exist')
      const [row] = await db
        .insert(snapshots)
        .values({
          workbookId: input.workbookId,
          storageKey: latest.storageKey,
          sizeBytes: latest.sizeBytes,
          createdBy: input.userId,
          reason: 'named',
          name: input.name,
        })
        .returning()
      return row
    },

    async restore(input: { workbookId: string; versionId: string; userId: string }) {
      const [version] = await db
        .select()
        .from(snapshots)
        .where(eq(snapshots.id, input.versionId))
        .limit(1)
      if (!version || version.workbookId !== input.workbookId || version.reason !== 'named') {
        throw new Error('version not found')
      }
      const [restored] = await db
        .insert(snapshots)
        .values({
          workbookId: input.workbookId,
          storageKey: version.storageKey,
          sizeBytes: version.sizeBytes,
          createdBy: input.userId,
          reason: 'manual',
          name: null,
        })
        .returning()
      if (!restored) throw new Error('restore insert returned no row')
      await db
        .update(workbooks)
        .set({ currentSnapshotId: restored.id, updatedAt: new Date() })
        .where(eq(workbooks.id, input.workbookId))
      return restored
    },
  }
}

export type VersionService = ReturnType<typeof createVersionService>
