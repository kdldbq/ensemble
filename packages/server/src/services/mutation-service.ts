import { sql } from 'drizzle-orm'
import type { Database } from '../db/client'
import { mutations } from '../db/schema'

export interface AppendInput {
  workbookId: string
  userId: string
  payload: unknown
}

export interface MutationRow {
  id: bigint
  workbookId: string
  seqNum: number
  userId: string
  appliedAt: Date
  payload: unknown
}

export function createMutationService(deps: { db: Database }) {
  return {
    async append(input: AppendInput): Promise<{ seqNum: number }> {
      return deps.db.transaction(async (tx) => {
        // Advisory lock keyed on the workbook UUID hash serialises concurrent
        // appends for the same workbook without requiring a lockable row to exist.
        // Use two-arg int4 form: hashtext() returns int4, avoiding bigint overflow.
        await tx.execute(sql`
          SELECT pg_advisory_xact_lock(
            hashtext(${input.workbookId}),
            0
          )
        `)
        const rows = await tx.execute<{ max_seq: number | null }>(sql`
          SELECT COALESCE(MAX(seq_num), 0) AS max_seq
          FROM mutations
          WHERE workbook_id = ${input.workbookId}
        `)
        const next = Number(rows[0]?.max_seq ?? 0) + 1
        await tx.insert(mutations).values({
          workbookId: input.workbookId,
          seqNum: next,
          userId: input.userId,
          payload: input.payload as never,
        })
        return { seqNum: next }
      })
    },

    async since(workbookId: string, lastSeq: number, maxRows = 200): Promise<MutationRow[]> {
      return deps.db.execute<MutationRow>(sql`
        SELECT id, workbook_id AS "workbookId", seq_num AS "seqNum",
               user_id AS "userId", applied_at AS "appliedAt", payload
        FROM mutations
        WHERE workbook_id = ${workbookId} AND seq_num > ${lastSeq}
        ORDER BY seq_num ASC
        LIMIT ${maxRows}
      `)
    },

    async currentSeq(workbookId: string): Promise<number> {
      const rows = await deps.db.execute<{ max_seq: number | null }>(sql`
        SELECT COALESCE(MAX(seq_num), 0) AS max_seq
        FROM mutations WHERE workbook_id = ${workbookId}
      `)
      return Number(rows[0]?.max_seq ?? 0)
    },
  }
}

export type MutationService = ReturnType<typeof createMutationService>
