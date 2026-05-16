import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { tenants, workbooks } from '../../src/db/schema'
import { withTenant } from '../../src/db/tenant-context'
import { appDb, db } from './_dbHelpers'

describe('Postgres RLS', () => {
  // db      = superuser (BYPASSRLS) — used for cross-tenant seed inserts
  // appDb   = app_user (no BYPASSRLS) — used inside withTenant so policies fire

  it('blocks cross-tenant SELECT', async () => {
    const [a] = await db.insert(tenants).values({ name: 'rls-a' }).returning()
    const [b] = await db.insert(tenants).values({ name: 'rls-b' }).returning()
    await db.insert(workbooks).values({ tenantId: a.id, ownerId: 'u-a', name: 'A only' })
    await db.insert(workbooks).values({ tenantId: b.id, ownerId: 'u-b', name: 'B only' })

    const fromA = await withTenant(appDb, a.id, async (tx) => tx.select().from(workbooks))
    expect(fromA.map((w) => w.name)).toEqual(['A only'])

    const fromB = await withTenant(appDb, b.id, async (tx) => tx.select().from(workbooks))
    expect(fromB.map((w) => w.name)).toEqual(['B only'])
  })

  it('blocks INSERT into another tenant via WITH CHECK', async () => {
    const [a] = await db.insert(tenants).values({ name: 'rls-check-a' }).returning()
    const [b] = await db.insert(tenants).values({ name: 'rls-check-b' }).returning()
    await expect(
      withTenant(appDb, a.id, async (tx) =>
        tx.insert(workbooks).values({ tenantId: b.id, ownerId: 'attacker', name: 'pwned' }),
      ),
    ).rejects.toThrow(/policy/i)
  })

  it('snapshot visibility follows workbook tenant', async () => {
    const [a] = await db.insert(tenants).values({ name: 'snap-rls-a' }).returning()
    const [wb] = await db
      .insert(workbooks)
      .values({ tenantId: a.id, ownerId: 'u', name: 'with-snap' })
      .returning()
    await db.execute(sql`
      INSERT INTO snapshots (workbook_id, storage_key, size_bytes, created_by, reason)
      VALUES (${wb.id}, 'k', 0, 'u', 'manual')
    `)
    const [other] = await db.insert(tenants).values({ name: 'snap-rls-other' }).returning()
    const snapsOther = await withTenant(appDb, other.id, async (tx) =>
      tx.execute(sql`SELECT * FROM snapshots`),
    )
    expect(snapsOther).toHaveLength(0)
  })
})
