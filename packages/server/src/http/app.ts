import { Hono } from 'hono'
import type { MiddlewareHandler } from 'hono'
import type { EventAdapter, IdentityAdapter, PermissionAdapter } from '../adapters/identity'
import type { LLMAdapter } from '../adapters/llm'
import type { StorageAdapter } from '../adapters/storage'
import type { Capability } from '../adapters/types'
import type { Database } from '../db/client'
import type { shareGrants } from '../db/schema'
import { createEventEmitter } from '../events/event-emitter'
import type { EventEmitter } from '../events/event-emitter'
import { createMaskCachePubSub } from '../realtime/mask-cache-pubsub'
import type { Redis } from '../redis/client'
import { createActivityService } from '../services/activity-service'
import type { ActivityService } from '../services/activity-service'
import { createCommentService } from '../services/comment-service'
import type { CommentService } from '../services/comment-service'
import { createFolderService } from '../services/folder-service'
import type { FolderService } from '../services/folder-service'
import { MaskRuleCache } from '../services/mask-service'
import { createProtectionService } from '../services/protection-service'
import type { ProtectionService } from '../services/protection-service'
import { createSnapshotService } from '../services/snapshot-service'
import type { SnapshotService } from '../services/snapshot-service'
import { createVersionService } from '../services/version-service'
import type { VersionService } from '../services/version-service'
import { createWorkbookService } from '../services/workbook-service'
import type { WorkbookService } from '../services/workbook-service'
import { activityRoute } from './routes/activity'
import { adminRoute } from './routes/admin'
import { aiRoute } from './routes/ai'
import { commentsRoute } from './routes/comments'
import { exportXlsxRoute } from './routes/export-xlsx'
import { rangeRoute } from './routes/range'
import { foldersRoute } from './routes/folders'
import { grantsRoute } from './routes/grants'
import type { GrantBody } from './routes/grants'
import { httpRequestDurationSeconds, httpRequestsTotal } from '../metrics'
import { healthRoute } from './routes/health'
import { metricsRoute } from './routes/metrics'
import { openApiRoute } from './routes/openapi'
import { protectionsRoute } from './routes/protections'
import { snapshotsRoute } from './routes/snapshots'
import { versionsRoute } from './routes/versions'
import { workbooksRoute } from './routes/workbooks'

export interface AppDeps {
  db: Database
  identity: IdentityAdapter
  permission: PermissionAdapter
  storage: StorageAdapter
  event: EventAdapter
  /** Optional: when provided, MaskRuleCache pub/sub invalidation is activated. */
  redis?: Redis
  /** Optional: when provided, AI routes (/api/v1/ai/*) become functional. */
  llm?: LLMAdapter
}

export interface AppServices {
  workbooks: WorkbookService
  snapshots: SnapshotService
  folders: FolderService
  masks: MaskRuleCache
  events: EventEmitter
  versions: VersionService
  activity: ActivityService
  protection: ProtectionService
  comments: CommentService
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
  /**
   * Optional Hono sub-app mounted AFTER the standard product routes. Intended for
   * deployment-specific helpers (e.g., the demo's whoami/reset endpoints) that should
   * share the same port without leaking into the product package.
   */
  extraRoutes?: Hono<AppEnv>
}

export function buildApp(deps: AppDeps, opts?: BuildAppOpts) {
  const maskCache = new MaskRuleCache(
    (identity, wbId) =>
      deps.permission.getMaskRules(identity, {
        type: 'workbook',
        id: wbId,
        tenantId: identity.tenantId,
      }),
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
    activity: createActivityService(deps.db),
    protection: createProtectionService(deps.db),
    comments: createCommentService(deps.db),
  }
  const app = new Hono<AppEnv>()
  app.use('*', async (c, next) => {
    c.set('deps', deps)
    c.set('services', services)
    await next()
  })
  // Metrics middleware: time + count HTTP requests by method + path-prefix +
  // status class. Path is bucketed to /api/v1/<first> to avoid cardinality
  // explosion from UUIDs.
  app.use('*', async (c, next) => {
    const start = process.hrtime.bigint()
    await next()
    const elapsedNs = Number(process.hrtime.bigint() - start)
    const elapsedSec = elapsedNs / 1e9
    const url = new URL(c.req.url, 'http://x')
    const pathParts = url.pathname.split('/').filter(Boolean)
    const bucket =
      pathParts[0] === 'api' && pathParts[1] === 'v1' && pathParts[2]
        ? `/api/v1/${pathParts[2]}`
        : pathParts[0]
          ? `/${pathParts[0]}`
          : '/'
    const status = c.res.status
    const statusClass = `${Math.floor(status / 100)}xx`
    const labels = { method: c.req.method, path: bucket, status: statusClass }
    httpRequestsTotal.inc(labels)
    httpRequestDurationSeconds.observe({ method: c.req.method, path: bucket }, elapsedSec)
  })
  // WS and other pre-auth routes must be registered before sub-routers
  // that have use('*', requireIdentity), which would intercept all paths.
  for (const { path, handler } of opts?.beforeRoutes ?? []) {
    app.get(path, handler)
  }
  app.route('/', healthRoute)
  app.route('/', openApiRoute)
  app.route('/', metricsRoute)
  // Extra routes must mount BEFORE the auth'd sub-routers because Hono's
  // `use('*', requireIdentity)` on a sub-app intercepts every request that passes
  // through that sub-app (not just paths it has registered), regardless of mount
  // path. Putting extra routes first means the demo/whoami etc. resolve before any
  // catch-all middleware can grab them.
  if (opts?.extraRoutes) {
    app.route('/', opts.extraRoutes)
  }
  app.route('/', workbooksRoute)
  app.route('/', snapshotsRoute)
  app.route('/', foldersRoute)
  app.route('/', grantsRoute)
  app.route('/', versionsRoute)
  app.route('/', exportXlsxRoute)
  app.route('/', activityRoute)
  app.route('/', protectionsRoute)
  app.route('/', adminRoute)
  app.route('/', aiRoute)
  app.route('/', commentsRoute)
  app.route('/', rangeRoute)
  return app
}
