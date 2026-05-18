import { and, asc, eq, isNull, max, ne } from 'drizzle-orm'
import type { Database } from '../db/client'
import { folders } from '../db/schema'

export const MAX_FOLDER_DEPTH = 10
export const MAX_FOLDER_NAME_LEN = 128

export class FolderValidationError extends Error {
  constructor(
    message: string,
    public readonly code: 'duplicate_name' | 'name_invalid' | 'depth_exceeded' | 'cycle',
  ) {
    super(message)
    this.name = 'FolderValidationError'
  }
}

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

export async function depthOf(
  folderId: string,
  parentOf: (id: string) => Promise<string | null>,
): Promise<number> {
  let depth = 0
  let current: string | null = folderId
  const seen = new Set<string>()
  while (current !== null) {
    if (seen.has(current)) return depth
    seen.add(current)
    current = await parentOf(current)
    depth++
  }
  return depth
}

function validateName(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length === 0) {
    throw new FolderValidationError('name cannot be empty', 'name_invalid')
  }
  if (trimmed.length > MAX_FOLDER_NAME_LEN) {
    throw new FolderValidationError(
      `name exceeds ${MAX_FOLDER_NAME_LEN} characters`,
      'name_invalid',
    )
  }
  return trimmed
}

export function createFolderService(db: Database) {
  const parentOfFactory = async (id: string): Promise<string | null> => {
    const rows = await db
      .select({ parentId: folders.parentId })
      .from(folders)
      .where(eq(folders.id, id))
      .limit(1)
    return rows[0]?.parentId ?? null
  }

  return {
    async create(input: {
      tenantId: string
      userId: string
      name: string
      parentId: string | null
      spaceType: 'personal' | 'shared'
    }) {
      const name = validateName(input.name)

      if (input.parentId !== null) {
        const parentDepth = await depthOf(input.parentId, parentOfFactory)
        if (parentDepth >= MAX_FOLDER_DEPTH) {
          throw new FolderValidationError(
            `cannot nest deeper than ${MAX_FOLDER_DEPTH} levels`,
            'depth_exceeded',
          )
        }
      }

      if (await this.hasDuplicateNameAtLevel(input.tenantId, input.parentId, name, null)) {
        throw new FolderValidationError(
          'a folder with this name already exists at this level',
          'duplicate_name',
        )
      }

      // Compute next position: max + 1 among siblings, or 0 if none.
      const [maxRow] = await db
        .select({ max: max(folders.position) })
        .from(folders)
        .where(
          and(
            eq(folders.tenantId, input.tenantId),
            input.parentId === null
              ? isNull(folders.parentId)
              : eq(folders.parentId, input.parentId),
            eq(folders.isDeleted, false),
          ),
        )
      const position = (maxRow?.max ?? -1) + 1

      const [row] = await db
        .insert(folders)
        .values({
          tenantId: input.tenantId,
          parentId: input.parentId ?? null,
          name,
          ownerId: input.userId,
          spaceType: input.spaceType,
          position,
        })
        .returning()
      return row
    },

    async rename(input: { tenantId: string; id: string; name: string }) {
      const name = validateName(input.name)

      const [current] = await db
        .select({ parentId: folders.parentId })
        .from(folders)
        .where(and(eq(folders.id, input.id), eq(folders.tenantId, input.tenantId)))
        .limit(1)
      if (!current) return null

      if (
        await this.hasDuplicateNameAtLevel(input.tenantId, current.parentId ?? null, name, input.id)
      ) {
        throw new FolderValidationError(
          'a folder with this name already exists at this level',
          'duplicate_name',
        )
      }

      const [row] = await db
        .update(folders)
        .set({ name, updatedAt: new Date() })
        .where(and(eq(folders.id, input.id), eq(folders.tenantId, input.tenantId)))
        .returning()
      return row ?? null
    },

    async move(input: { tenantId: string; id: string; newParentId: string | null }) {
      if (await wouldCreateCycle(input.id, input.newParentId, parentOfFactory)) {
        throw new FolderValidationError('folder move would create a cycle', 'cycle')
      }

      if (input.newParentId !== null) {
        const parentDepth = await depthOf(input.newParentId, parentOfFactory)
        if (parentDepth >= MAX_FOLDER_DEPTH) {
          throw new FolderValidationError(
            `cannot nest deeper than ${MAX_FOLDER_DEPTH} levels`,
            'depth_exceeded',
          )
        }
      }

      const [movingFolder] = await db
        .select({ name: folders.name })
        .from(folders)
        .where(and(eq(folders.id, input.id), eq(folders.tenantId, input.tenantId)))
        .limit(1)
      if (movingFolder) {
        if (
          await this.hasDuplicateNameAtLevel(
            input.tenantId,
            input.newParentId,
            movingFolder.name,
            input.id,
          )
        ) {
          throw new FolderValidationError(
            'a folder with this name already exists at the destination',
            'duplicate_name',
          )
        }
      }

      const [row] = await db
        .update(folders)
        .set({ parentId: input.newParentId, updatedAt: new Date() })
        .where(and(eq(folders.id, input.id), eq(folders.tenantId, input.tenantId)))
        .returning()
      return row ?? null
    },

    async reorder(input: {
      tenantId: string
      id: string
      newPosition: number
      newParentId?: string | null
    }) {
      if (input.newParentId !== undefined) {
        await this.move({
          tenantId: input.tenantId,
          id: input.id,
          newParentId: input.newParentId,
        })
      }
      const [row] = await db
        .update(folders)
        .set({ position: input.newPosition, updatedAt: new Date() })
        .where(and(eq(folders.id, input.id), eq(folders.tenantId, input.tenantId)))
        .returning()
      return row ?? null
    },

    async softDelete(input: { tenantId: string; id: string }) {
      await db
        .update(folders)
        .set({ isDeleted: true, deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(folders.id, input.id), eq(folders.tenantId, input.tenantId)))
    },

    async restore(input: { tenantId: string; id: string }) {
      const [row] = await db
        .update(folders)
        .set({ isDeleted: false, deletedAt: null, updatedAt: new Date() })
        .where(and(eq(folders.id, input.id), eq(folders.tenantId, input.tenantId)))
        .returning()
      return row ?? null
    },

    async listForTenant(tenantId: string, opts?: { includeDeleted?: boolean }) {
      const baseWhere = opts?.includeDeleted
        ? eq(folders.tenantId, tenantId)
        : and(eq(folders.tenantId, tenantId), eq(folders.isDeleted, false))
      return db
        .select()
        .from(folders)
        .where(baseWhere)
        .orderBy(asc(folders.position), asc(folders.createdAt))
    },

    async listTrashed(tenantId: string) {
      return db
        .select()
        .from(folders)
        .where(and(eq(folders.tenantId, tenantId), eq(folders.isDeleted, true)))
        .orderBy(asc(folders.deletedAt))
    },

    async hasDuplicateNameAtLevel(
      tenantId: string,
      parentId: string | null,
      name: string,
      excludeId: string | null,
    ): Promise<boolean> {
      const conditions = [
        eq(folders.tenantId, tenantId),
        eq(folders.name, name),
        eq(folders.isDeleted, false),
        parentId === null ? isNull(folders.parentId) : eq(folders.parentId, parentId),
      ]
      if (excludeId !== null) conditions.push(ne(folders.id, excludeId))
      const rows = await db
        .select({ id: folders.id })
        .from(folders)
        .where(and(...conditions))
        .limit(1)
      return rows.length > 0
    },
  }
}

export type FolderService = ReturnType<typeof createFolderService>
