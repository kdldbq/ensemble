import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { tenants, workbooks } from '../../src/db/schema'
import { withTenant } from '../../src/db/tenant-context'
import { createMutationService } from '../../src/services/mutation-service'
import { appDb, db } from './_dbHelpers'

describe('mutations RLS', () => {
  it('blocks cross-tenant mutation read', async () => {
    const [a] = await db.insert(tenants).values({ name: 'mut-rls-a' }).returning()
    const [b] = await db.insert(tenants).values({ name: 'mut-rls-b' }).returning()
    const [wbA] = await db
      .insert(workbooks)
      .values({ tenantId: a.id, ownerId: 'u', name: 'A' })
      .returning()
    await createMutationService({ db }).append({
      workbookId: wbA.id,
      userId: 'u',
      payload: { x: 1 },
    })

    const fromB = await withTenant(appDb, b.id, async (tx) =>
      tx.execute(sql`SELECT * FROM mutations`),
    )
    expect(fromB).toHaveLength(0)
  })
})
