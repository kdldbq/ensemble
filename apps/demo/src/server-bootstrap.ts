import { type Database, type StorageAdapter, and, eq, schema, sql } from '@ensemble-sheets/server'
import { makeSeedWorkbook } from './seed-workbook'

/**
 * Idempotently insert the demo tenant row. Returns when the row is guaranteed present.
 */
export async function ensureDemoTenant(db: Database, id: string, name: string): Promise<void> {
  await db.execute(
    sql`INSERT INTO tenants (id, name) VALUES (${id}, ${name}) ON CONFLICT (id) DO NOTHING`,
  )
}

/**
 * Idempotently ensure the global public-room workbook exists with seeded content.
 * Called at server boot so the visitor's `/api/demo/whoami` response can hand back a
 * stable `publicRoomWbId`.
 */
export async function ensurePublicRoomWorkbook(opts: {
  db: Database
  storage: StorageAdapter
  tenantId: string
  wbId: string
}): Promise<void> {
  const { db, storage, tenantId, wbId } = opts
  const existing = await db
    .select({ id: schema.workbooks.id })
    .from(schema.workbooks)
    .where(eq(schema.workbooks.id, wbId))
    .limit(1)
  if (existing[0]) return

  await db.execute(sql`
    INSERT INTO workbooks (id, tenant_id, name, owner_id)
    VALUES (${wbId}, ${tenantId}, ${'公共房间'}, ${'demo-system'})
    ON CONFLICT (id) DO NOTHING
  `)
  await seedInitialSnapshot({ db, storage, wbId, title: '公共房间', createdBy: 'demo-system' })
}

/**
 * Look up the caller's personal sandbox workbook. Creates one (with seeded content) if
 * the user has none. Returns the workbook id.
 */
export async function ensureSandboxWorkbook(opts: {
  db: Database
  storage: StorageAdapter
  tenantId: string
  userId: string
}): Promise<string> {
  const { db, storage, tenantId, userId } = opts
  const existing = await db
    .select({ id: schema.workbooks.id })
    .from(schema.workbooks)
    .where(
      and(
        eq(schema.workbooks.tenantId, tenantId),
        eq(schema.workbooks.ownerId, userId),
        eq(schema.workbooks.name, '我的沙盒'),
        eq(schema.workbooks.isDeleted, false),
      ),
    )
    .limit(1)
  if (existing[0]) return existing[0].id

  const [row] = await db
    .insert(schema.workbooks)
    .values({ tenantId, ownerId: userId, name: '我的沙盒' })
    .returning({ id: schema.workbooks.id })
  if (!row) throw new Error('failed to create sandbox workbook')
  await seedInitialSnapshot({ db, storage, wbId: row.id, title: '我的沙盒', createdBy: userId })
  return row.id
}

async function seedInitialSnapshot(opts: {
  db: Database
  storage: StorageAdapter
  wbId: string
  title: string
  createdBy: string
}): Promise<void> {
  const { db, storage, wbId, title, createdBy } = opts
  const json = JSON.stringify(makeSeedWorkbook(title))
  const bytes = new TextEncoder().encode(json)
  const storageKey = `snapshots/${wbId}/${crypto.randomUUID()}.json`
  await storage.put(storageKey, bytes, { contentType: 'application/json' })
  const [snap] = await db
    .insert(schema.snapshots)
    .values({
      workbookId: wbId,
      storageKey,
      sizeBytes: bytes.length,
      createdBy,
      reason: 'auto',
    })
    .returning({ id: schema.snapshots.id })
  if (!snap) throw new Error('failed to insert seed snapshot row')
  await db
    .update(schema.workbooks)
    .set({ currentSnapshotId: snap.id })
    .where(eq(schema.workbooks.id, wbId))
}

/**
 * Wipe per-visitor data for the demo tenant, preserving the public-room workbook row.
 * The public room's snapshots and mutations are dropped so the seed regenerates on the
 * next ensurePublicRoomWorkbook call (which runs at server boot).
 */
export async function resetDemoData(opts: {
  db: Database
  tenantId: string
  publicRoomWbId: string
}): Promise<{ workbooksDeleted: number; foldersDeleted: number }> {
  const { db, tenantId, publicRoomWbId } = opts

  await db.execute(sql`
    DELETE FROM mutations
    WHERE workbook_id IN (
      SELECT id FROM workbooks WHERE tenant_id = ${tenantId}
    )
  `)
  await db.execute(sql`
    DELETE FROM share_grants WHERE tenant_id = ${tenantId}
  `)
  await db.execute(sql`
    UPDATE workbooks SET current_snapshot_id = NULL WHERE tenant_id = ${tenantId}
  `)
  await db.execute(sql`
    DELETE FROM snapshots
    WHERE workbook_id IN (
      SELECT id FROM workbooks WHERE tenant_id = ${tenantId}
    )
  `)
  const wbResult = await db.execute<{ count: string }>(sql`
    WITH d AS (
      DELETE FROM workbooks
      WHERE tenant_id = ${tenantId} AND id != ${publicRoomWbId}
      RETURNING 1
    )
    SELECT COUNT(*)::text AS count FROM d
  `)
  const foldResult = await db.execute<{ count: string }>(sql`
    WITH d AS (
      DELETE FROM folders WHERE tenant_id = ${tenantId} RETURNING 1
    )
    SELECT COUNT(*)::text AS count FROM d
  `)
  const wbCount = Number((wbResult as unknown as Array<{ count: string }>)[0]?.count ?? '0')
  const foldCount = Number((foldResult as unknown as Array<{ count: string }>)[0]?.count ?? '0')
  return { workbooksDeleted: wbCount, foldersDeleted: foldCount }
}
