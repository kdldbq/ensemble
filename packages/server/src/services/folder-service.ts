import { and, eq } from 'drizzle-orm'
import type { Database } from '../db/client'
import { folders } from '../db/schema'

export async function wouldCreateCycle(
  movingId: string,
  newParentId: string | null,
  parentOf: (id: string) => Promise<string | null>,
): Promise<boolean> {
  if (newParentId === null) return false
  if (newParentId === movingId) return true
  let current: string | null = newParentId
  const seen = new Set<string>()
  while (current) {
    if (current === movingId) return true
    if (seen.has(current)) return false
    seen.add(current)
    current = await parentOf(current)
  }
  return false
}

export function createFolderService(db: Database) {
  return {
    async create(input: {
      tenantId: string
      userId: string
      name: string
      parentId: string | null
      spaceType: 'personal' | 'shared'
    }) {
      const [row] = await db
        .insert(folders)
        .values({
          tenantId: input.tenantId,
          parentId: input.parentId ?? null,
          name: input.name,
          ownerId: input.userId,
          spaceType: input.spaceType,
        })
        .returning()
      return row
    },

    async rename(input: { tenantId: string; id: string; name: string }) {
      const [row] = await db
        .update(folders)
        .set({ name: input.name, updatedAt: new Date() })
        .where(and(eq(folders.id, input.id), eq(folders.tenantId, input.tenantId)))
        .returning()
      return row ?? null
    },

    async move(input: { tenantId: string; id: string; newParentId: string | null }) {
      const parentOf = async (id: string): Promise<string | null> => {
        const rows = await db
          .select({ parentId: folders.parentId })
          .from(folders)
          .where(eq(folders.id, id))
          .limit(1)
        return rows[0]?.parentId ?? null
      }
      if (await wouldCreateCycle(input.id, input.newParentId, parentOf)) {
        throw new Error('folder move would create a cycle')
      }
      const [row] = await db
        .update(folders)
        .set({ parentId: input.newParentId, updatedAt: new Date() })
        .where(and(eq(folders.id, input.id), eq(folders.tenantId, input.tenantId)))
        .returning()
      return row ?? null
    },

    async softDelete(input: { tenantId: string; id: string }) {
      await db
        .update(folders)
        .set({ isDeleted: true, updatedAt: new Date() })
        .where(and(eq(folders.id, input.id), eq(folders.tenantId, input.tenantId)))
    },

    async listForTenant(tenantId: string) {
      return db
        .select()
        .from(folders)
        .where(and(eq(folders.tenantId, tenantId), eq(folders.isDeleted, false)))
    },
  }
}

export type FolderService = ReturnType<typeof createFolderService>
