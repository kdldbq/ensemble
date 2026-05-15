import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from './_dbHelpers'

describe('migration', () => {
  it('creates the core tables', async () => {
    const rows = await db.execute(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name
    `)
    const names = rows.map((r) => r.table_name as string)
    expect(names).toEqual(expect.arrayContaining(['tenants', 'folders', 'workbooks', 'snapshots']))
  })
})
