import { mkdir } from 'node:fs/promises'
import {
  type IdentityAdapter,
  NoopEventAdapter,
  type PermissionAdapter,
  createDb,
  createServer,
} from '@ensemble-sheets/server'
import { FsStorage } from '@ensemble-sheets/storage-fs'
import { capabilitiesFor, idToPersona, maskRulesFor } from './persona'
import { ensureDemoTenant, ensurePublicRoomWorkbook } from './server-bootstrap'
import { buildDemoRoutes } from './server-demo-routes'

const dataDir = process.env.ENSEMBLE_DATA ?? './data'
await mkdir(dataDir, { recursive: true })

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const PUBLIC_ROOM_WB_ID = process.env.PUBLIC_ROOM_WB_ID ?? '00000000-0000-0000-0000-000000000099'
const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) throw new Error('DATABASE_URL is required')

const storage = new FsStorage({ root: dataDir })
const db = createDb(DATABASE_URL)
await ensureDemoTenant(db, TENANT_ID, 'demo')
await ensurePublicRoomWorkbook({
  db,
  storage,
  tenantId: TENANT_ID,
  wbId: PUBLIC_ROOM_WB_ID,
})

// WARNING: DEV-ONLY STUB — Do NOT use in production.
// Accepts any token prefixed with "dev:" without verification. Production hosts must
// implement IdentityAdapter with real JWT/JWKS verification (see @ensemble-sheets/identity-jwks).
const identity: IdentityAdapter = {
  resolveFromToken: async (token) => {
    if (!token.startsWith('dev:')) throw new Error('bad token')
    return { tenantId: TENANT_ID, userId: token.slice('dev:'.length) }
  },
}

// Demo permission/mask are pure functions of userId, mirroring the product contract.
const permission: PermissionAdapter = {
  getCapabilities: async (id) => capabilitiesFor(idToPersona(id.userId)),
  getMaskRules: async (id) => maskRulesFor(idToPersona(id.userId)),
}

const extraRoutes = buildDemoRoutes({
  db,
  storage,
  tenantId: TENANT_ID,
  publicRoomWbId: PUBLIC_ROOM_WB_ID,
  resetToken: process.env.DEMO_RESET_TOKEN,
})

const handle = await createServer({
  databaseUrl: DATABASE_URL,
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  identity,
  permission,
  storage,
  event: new NoopEventAdapter(),
  extraRoutes,
}).listen({ port: Number(process.env.PORT ?? 5301) })

console.log(`ensemble demo server on :${handle.port}`)
console.log(`  public room workbook: ${PUBLIC_ROOM_WB_ID}`)
if (process.env.DEMO_RESET_TOKEN) {
  console.log('  POST /api/demo/reset is ENABLED (header X-Demo-Reset-Token required)')
} else {
  console.log('  POST /api/demo/reset is DISABLED (set DEMO_RESET_TOKEN to enable)')
}
