import { Hono } from 'hono'
import type { MiddlewareHandler } from 'hono'
import type { Database } from '../db/client'
import type { IdentityAdapter, PermissionAdapter, EventAdapter } from '../adapters/identity'
import type { StorageAdapter } from '../adapters/storage'
import { healthRoute } from './routes/health'
import { workbooksRoute } from './routes/workbooks'
import { snapshotsRoute } from './routes/snapshots'

export interface AppDeps {
  db: Database
  identity: IdentityAdapter
  permission: PermissionAdapter
  storage: StorageAdapter
  event: EventAdapter
}

export type AppEnv = { Variables: { deps: AppDeps; identity?: { tenantId: string; userId: string } } }

export interface BuildAppOpts {
  /** Optional WS route handlers to register BEFORE sub-routers that have requireIdentity. */
  beforeRoutes?: Array<{ path: string; handler: MiddlewareHandler }>
}

export function buildApp(deps: AppDeps, opts?: BuildAppOpts) {
  const app = new Hono<AppEnv>()
  app.use('*', async (c, next) => {
    c.set('deps', deps)
    await next()
  })
  // WS and other pre-auth routes must be registered before sub-routers
  // that have use('*', requireIdentity), which would intercept all paths.
  for (const { path, handler } of opts?.beforeRoutes ?? []) {
    app.get(path, handler)
  }
  app.route('/', healthRoute)
  app.route('/', workbooksRoute)
  app.route('/', snapshotsRoute)
  return app
}
