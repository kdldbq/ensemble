import { Hono } from 'hono'
import type { MiddlewareHandler } from 'hono'
import type { Database } from '../db/client'
import type { IdentityAdapter, PermissionAdapter, EventAdapter } from '../adapters/identity'
import type { StorageAdapter } from '../adapters/storage'
import type { Capability } from '../adapters/types'
import type { Redis } from '../redis/client'
import { createWorkbookService } from '../services/workbook-service'
import { createSnapshotService } from '../services/snapshot-service'
import { createFolderService } from '../services/folder-service'
import { MaskRuleCache } from '../services/mask-service'
import { createEventEmitter } from '../events/event-emitter'
import { createMaskCachePubSub } from '../realtime/mask-cache-pubsub'
import { createVersionService } from '../services/version-service'
import type { WorkbookService } from '../services/workbook-service'
import type { SnapshotService } from '../services/snapshot-service'
import type { FolderService } from '../services/folder-service'
import type { EventEmitter } from '../events/event-emitter'
import type { VersionService } from '../services/version-service'
import { healthRoute } from './routes/health'
import { workbooksRoute } from './routes/workbooks'
import { snapshotsRoute } from './routes/snapshots'
import { foldersRoute } from './routes/folders'
import { grantsRoute } from './routes/grants'
import { versionsRoute } from './routes/versions'
import type { GrantBody } from './routes/grants'
import type { shareGrants } from '../db/schema'

export interface AppDeps {
  db: Database
  identity: IdentityAdapter
  permission: PermissionAdapter
  storage: StorageAdapter
  event: EventAdapter
  /** Optional: when provided, MaskRuleCache pub/sub invalidation is activated. */
  redis?: Redis
}

export interface AppServices {
  workbooks: WorkbookService
  snapshots: SnapshotService
  folders: FolderService
  masks: MaskRuleCache
  events: EventEmitter
  versions: VersionService
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
  const maskCache = new MaskRuleCache(
    (identity, wbId) => deps.permission.getMaskRules(identity, { type: 'workbook', id: wbId, tenantId: identity.tenantId }),
    60_000,
  )
  if (deps.redis) {
    const maskPubSub = createMaskCachePubSub({
      redis: deps.redis,
      onInvalidate: (userId, workbookId) => maskCache._dropLocal(userId, workbookId),
    })
    maskCache.setPubSub(maskPubSub)
    void maskPubSub.start()
  }
  const snapshots = createSnapshotService(deps.db, deps.storage)
  const services: AppServices = {
    workbooks: createWorkbookService(deps.db),
    snapshots,
    folders: createFolderService(deps.db),
    masks: maskCache,
    events: createEventEmitter({ db: deps.db, eventAdapter: deps.event }),
    versions: createVersionService(deps.db, snapshots),
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
  app.route('/', versionsRoute)
  return app
}
