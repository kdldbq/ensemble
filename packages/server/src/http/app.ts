import { Hono } from 'hono'
import type { Database } from '../db/client'
import type { IdentityAdapter, PermissionAdapter, EventAdapter } from '../adapters/identity'
import type { StorageAdapter } from '../adapters/storage'
import { healthRoute } from './routes/health'

export interface AppDeps {
  db: Database
  identity: IdentityAdapter
  permission: PermissionAdapter
  storage: StorageAdapter
  event: EventAdapter
}

export type AppEnv = { Variables: { deps: AppDeps; identity?: { tenantId: string; userId: string } } }

export function buildApp(deps: AppDeps) {
  const app = new Hono<AppEnv>()
  app.use('*', async (c, next) => {
    c.set('deps', deps)
    await next()
  })
  app.route('/', healthRoute)
  return app
}
