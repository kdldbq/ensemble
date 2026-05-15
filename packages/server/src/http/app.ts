import { Hono } from 'hono'
import type { MiddlewareHandler } from 'hono'
import type { Database } from '../db/client'
import type { IdentityAdapter, PermissionAdapter, EventAdapter } from '../adapters/identity'
import type { StorageAdapter } from '../adapters/storage'
import type { Capability } from '../adapters/types'
import { createWorkbookService } from '../services/workbook-service'
import { createSnapshotService } from '../services/snapshot-service'
import { createFolderService } from '../services/folder-service'
import { MaskRuleCache } from '../services/mask-service'
import type { WorkbookService } from '../services/workbook-service'
import type { SnapshotService } from '../services/snapshot-service'
import type { FolderService } from '../services/folder-service'
import { healthRoute } from './routes/health'
import { workbooksRoute } from './routes/workbooks'
import { snapshotsRoute } from './routes/snapshots'
import { foldersRoute } from './routes/folders'
import { grantsRoute } from './routes/grants'
import type { GrantBody } from './routes/grants'
import type { shareGrants } from '../db/schema'

export interface AppDeps {
  db: Database
  identity: IdentityAdapter
  permission: PermissionAdapter
  storage: StorageAdapter
  event: EventAdapter
}

export interface AppServices {
  workbooks: WorkbookService
  snapshots: SnapshotService
  folders: FolderService
  masks: MaskRuleCache
}

export type AppEnv = {
  Variables: {
    deps: AppDeps
    services: AppServices
    identity?: { tenantId: string; userId: string }
    capabilities?: Capability
    grantBody?: GrantBody
    grantToDelete?: typeof shareGrants.$inferSelect
  }
}

export interface BuildAppOpts {
  /** Optional WS route handlers to register BEFORE sub-routers that have requireIdentity. */
  beforeRoutes?: Array<{ path: string; handler: MiddlewareHandler }>
}

export function buildApp(deps: AppDeps, opts?: BuildAppOpts) {
  const services: AppServices = {
    workbooks: createWorkbookService(deps.db),
    snapshots: createSnapshotService(deps.db, deps.storage),
    folders: createFolderService(deps.db),
    masks: new MaskRuleCache(
      (identity, wbId) => deps.permission.getMaskRules(identity, { type: 'workbook', id: wbId, tenantId: identity.tenantId }),
      60_000,
    ),
  }
  const app = new Hono<AppEnv>()
  app.use('*', async (c, next) => {
    c.set('deps', deps)
    c.set('services', services)
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
  app.route('/', foldersRoute)
  app.route('/', grantsRoute)
  return app
}
