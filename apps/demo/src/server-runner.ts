import { createServer, NoopEventAdapter, type IdentityAdapter, type PermissionAdapter } from '@ensemble/server'
import { FsStorage } from '@ensemble/storage-fs'
import { mkdir } from 'node:fs/promises'
import postgres from 'postgres'

const dataDir = process.env.ENSEMBLE_DATA ?? './data'
await mkdir(dataDir, { recursive: true })

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

const sql = postgres(process.env.DATABASE_URL!, { max: 1 })
await sql`INSERT INTO tenants (id, name) VALUES (${TENANT_ID}, 'demo') ON CONFLICT (id) DO NOTHING`
await sql.end()

const identity: IdentityAdapter = {
  resolveFromToken: async (token) => {
    if (!token.startsWith('dev:')) throw new Error('bad token')
    return { tenantId: TENANT_ID, userId: token.slice('dev:'.length) }
  },
}
const permission: PermissionAdapter = {
  getCapabilities: async () => ({ canView: true, canEdit: true, canShare: true, canDelete: true }),
  getMaskRules: async () => [],
}

const handle = await createServer({
  databaseUrl: process.env.DATABASE_URL!,
  identity,
  permission,
  storage: new FsStorage({ root: dataDir }),
  event: new NoopEventAdapter(),
}).listen({ port: Number(process.env.PORT ?? 3000) })

console.log(`ensemble demo server on :${handle.port}`)
