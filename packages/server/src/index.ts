export * from './adapters/types'
export type { IdentityAdapter, PermissionAdapter, EventAdapter } from './adapters/identity'
export {
  NotImplementedIdentityAdapter,
  NotImplementedPermissionAdapter,
  NoopEventAdapter,
} from './adapters/identity'
export type { StorageAdapter } from './adapters/storage'
export { createServer, type CreateServerOpts } from './server'
export { buildApp, type AppDeps, type AppEnv } from './http/app'
export { createDb, type Database } from './db/client'
export * as schema from './db/schema'
// Re-export the drizzle helpers we know consumers need so they pull from this package's
// single drizzle instance (avoids pnpm dedupe issues when consumers also depend on
// drizzle-orm directly via a different peer context).
export { and, eq, sql } from 'drizzle-orm'
