import { createServer, NoopEventAdapter, type IdentityAdapter, type PermissionAdapter } from '@ensemble-sheets/server'
import { FsStorage } from '@ensemble-sheets/storage-fs'
import { mkdir } from 'node:fs/promises'
import postgres from 'postgres'

const dataDir = process.env.ENSEMBLE_DATA ?? './data'
await mkdir(dataDir, { recursive: true })

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

const sql = postgres(process.env.DATABASE_URL!, { max: 1 })
await sql`INSERT INTO tenants (id, name) VALUES (${TENANT_ID}, 'demo') ON CONFLICT (id) DO NOTHING`
await sql.end()

// WARNING: DEV-ONLY STUB — Do NOT use in production.
// This adapter accepts any token prefixed with "dev:" without verification.
// Production hosts must implement IdentityAdapter with real JWT/JWKS verification
// (see @ensemble-sheets/identity-jwks in Sprint 2).
const identity: IdentityAdapter = {
  resolveFromToken: async (token) => {
    if (!token.startsWith('dev:')) throw new Error('bad token')
    return { tenantId: TENANT_ID, userId: token.slice('dev:'.length) }
  },
}
const permission: PermissionAdapter = {
  getCapabilities: async (identity) => {
    if (identity.userId === 'admin')
      return { canView: true, canEdit: true, canShare: true, canDelete: true }
    if (identity.userId === 'viewer')
      return { canView: true, canEdit: false, canShare: false, canDelete: false }
    return { canView: false, canEdit: false, canShare: false, canDelete: false }
  },
  getMaskRules: async (identity) => {
    if (identity.userId === 'viewer') {
      return [{ match: { type: 'column', sheet: '*', column: 'B' }, action: { type: 'redact', replacement: '***' } }]
    }
    return []
  },
}

const handle = await createServer({
  databaseUrl: process.env.DATABASE_URL!,
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  identity,
  permission,
  storage: new FsStorage({ root: dataDir }),
  event: new NoopEventAdapter(),
}).listen({ port: Number(process.env.PORT ?? 3000) })

console.log(`ensemble demo server on :${handle.port}`)
