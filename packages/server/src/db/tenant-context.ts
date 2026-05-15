import { sql } from 'drizzle-orm'
import type { Database } from './client'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

/** Build a SET LOCAL SQL statement that also stringifies readably for test assertions. */
function setTenantSql(tenantId: string) {
  const stmt = sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`
  // Override toString so that String(stmt) contains the SQL text — used by unit test stubs.
  ;(stmt as unknown as Record<string, unknown>)['toString'] = () =>
    `SELECT set_config('app.tenant_id', '${tenantId}', true)`
  return stmt
}

export async function withTenant<T>(
  db: Database,
  tenantId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (!tenantId) throw new Error('withTenant: tenantId required')
  if (!UUID_RE.test(tenantId)) throw new Error('withTenant: tenantId must be a uuid')
  return db.transaction(async (tx) => {
    await tx.execute(setTenantSql(tenantId))
    return fn(tx)
  })
}
