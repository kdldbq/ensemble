import { and, asc, eq, sql } from 'drizzle-orm'
import type { Database } from '../db/client'
import { comments } from '../db/schema'

export interface Comment {
  id: string
  tenantId: string
  workbookId: string
  threadId: string
  cellRef: string | null
  parentId: string | null
  authorId: string
  body: string
  mentions: string[]
  resolved: boolean
  resolvedBy: string | null
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
}

function toComment(row: typeof comments.$inferSelect): Comment {
  return {
    id: row.id,
    tenantId: row.tenantId,
    workbookId: row.workbookId,
    threadId: row.threadId,
    cellRef: row.cellRef,
    parentId: row.parentId,
    authorId: row.authorId,
    body: row.body,
    mentions: row.mentions ?? [],
    resolved: row.resolved,
    resolvedBy: row.resolvedBy,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

const MAX_BODY_LEN = 4000

/**
 * Parse `@userId` style mentions out of the body. Recognises ASCII alnum +
 * dash + underscore; bounded by either start/space/end. Returns deduped list.
 */
export function parseMentions(body: string): string[] {
  const re = /(?:^|[\s,.;!?])@([A-Za-z0-9][A-Za-z0-9_-]{0,63})/g
  const set = new Set<string>()
  for (const m of body.matchAll(re)) {
    if (m[1]) set.add(m[1])
  }
  return [...set]
}

export function createCommentService(db: Database) {
  return {
    async create(input: {
      tenantId: string
      workbookId: string
      threadId: string
      cellRef: string | null
      parentId: string | null
      authorId: string
      body: string
    }): Promise<Comment> {
      const body = input.body.trim()
      if (body.length === 0) throw new Error('comment body cannot be empty')
      if (body.length > MAX_BODY_LEN) {
        throw new Error(`comment body exceeds ${MAX_BODY_LEN} chars`)
      }
      const mentions = parseMentions(body)
      const [row] = await db
        .insert(comments)
        .values({
          tenantId: input.tenantId,
          workbookId: input.workbookId,
          threadId: input.threadId,
          cellRef: input.cellRef,
          parentId: input.parentId,
          authorId: input.authorId,
          body,
          mentions,
        })
        .returning()
      if (!row) throw new Error('comment insert returned no row')
      return toComment(row)
    },

    async update(input: {
      tenantId: string
      id: string
      body?: string
      resolved?: boolean
      resolvedBy?: string | null
    }): Promise<Comment | null> {
      const patch: Partial<typeof comments.$inferInsert> = { updatedAt: new Date() }
      if (input.body !== undefined) {
        const body = input.body.trim()
        if (body.length === 0 || body.length > MAX_BODY_LEN) return null
        patch.body = body
        patch.mentions = parseMentions(body)
      }
      if (input.resolved !== undefined) {
        patch.resolved = input.resolved
        if (input.resolved) {
          patch.resolvedBy = input.resolvedBy ?? null
          patch.resolvedAt = new Date()
        } else {
          patch.resolvedBy = null
          patch.resolvedAt = null
        }
      }
      const [row] = await db
        .update(comments)
        .set(patch)
        .where(and(eq(comments.id, input.id), eq(comments.tenantId, input.tenantId)))
        .returning()
      return row ? toComment(row) : null
    },

    async delete(input: { tenantId: string; id: string }): Promise<boolean> {
      const res = await db
        .delete(comments)
        .where(and(eq(comments.id, input.id), eq(comments.tenantId, input.tenantId)))
        .returning({ id: comments.id })
      return res.length > 0
    },

    async listForWorkbook(
      tenantId: string,
      workbookId: string,
      opts?: { includeResolved?: boolean },
    ): Promise<Comment[]> {
      const conds = [eq(comments.tenantId, tenantId), eq(comments.workbookId, workbookId)]
      if (!opts?.includeResolved) conds.push(eq(comments.resolved, false))
      const rows = await db
        .select()
        .from(comments)
        .where(and(...conds))
        .orderBy(asc(comments.createdAt))
      return rows.map(toComment)
    },

    async listForThread(
      tenantId: string,
      workbookId: string,
      threadId: string,
    ): Promise<Comment[]> {
      const rows = await db
        .select()
        .from(comments)
        .where(
          and(
            eq(comments.tenantId, tenantId),
            eq(comments.workbookId, workbookId),
            eq(comments.threadId, threadId),
          ),
        )
        .orderBy(asc(comments.createdAt))
      return rows.map(toComment)
    },

    async countOpenForWorkbook(tenantId: string, workbookId: string): Promise<number> {
      const [row] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(comments)
        .where(
          and(
            eq(comments.tenantId, tenantId),
            eq(comments.workbookId, workbookId),
            eq(comments.resolved, false),
          ),
        )
      return row?.c ?? 0
    },
  }
}

export type CommentService = ReturnType<typeof createCommentService>
