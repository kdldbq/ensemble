import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import type { Hono } from 'hono'
import type { EventAdapter, IdentityAdapter, PermissionAdapter } from './adapters/identity'
import type { LLMAdapter } from './adapters/llm'
import type { StorageAdapter } from './adapters/storage'
import { createDb } from './db/client'
import { type AppDeps, type AppEnv, buildApp } from './http/app'
import { logger } from './logger'
import { createTokenBucket } from './realtime/backpressure'
import { createCellLockManager } from './realtime/cell-lock-manager'
import { createRoomRegistry } from './realtime/collab-room'
import { createMutationBroadcaster } from './realtime/mutation-broadcaster'
import { createNotificationBus } from './realtime/notification-bus'
import { createPerTenantBucket } from './realtime/per-tenant-bucket'
import { createPresenceTracker } from './realtime/presence-tracker'
import { createSessionRegistry } from './realtime/session-registry'
import { createRedis } from './redis/client'
import { createMutationService } from './services/mutation-service'
import { createSession } from './ws/session'
import { sendWelcome } from './ws/welcome'

export interface CreateServerOpts {
  databaseUrl: string
  identity: IdentityAdapter
  permission: PermissionAdapter
  storage: StorageAdapter
  event: EventAdapter
  redisUrl?: string
  /** Optional LLM adapter. When provided, /api/v1/ai/* routes become functional. */
  llm?: LLMAdapter
  /**
   * Optional Hono sub-app mounted after the product routes — for deployment-specific
   * helpers (e.g., the demo's whoami/reset endpoints) that share the same port without
   * being part of the product API surface.
   */
  extraRoutes?: Hono<AppEnv>
  /**
   * Enable real-time collab subsystems. Default `true`.
   *
   * When `false` (single-user mode):
   *  - No Redis client is created — `redisUrl` is ignored and no connection attempted
   *  - No WebSocket bridge is registered (`/api/v1/ws/:workbookId` returns 404)
   *  - No cell-region locks, presence, mutation broadcaster, room registry,
   *    notification bus, or session registry are constructed
   *  - Saves go through the existing REST snapshots route — `mountWorkbookEditor`
   *    must be called with `collab: false` so the client also skips its WS layer
   *
   * Use single-user mode when you only need editor + persistence and don't need
   * multi-user cursors / locks / live mutation broadcast.
   */
  collab?: boolean
}

/**
 * Build every collab subsystem in one shot. Used by createServer when
 * `collab` is enabled; not exported because the lifecycle (Redis connection,
 * presence-sweep timer) is owned by createServer. Returning a single object
 * lets the WS handler destructure once and avoids per-field narrowing
 * asserts at the call site.
 */
function buildCollabInfra(opts: CreateServerOpts, db: ReturnType<typeof createDb>) {
  const redis = createRedis(opts.redisUrl ?? process.env.REDIS_URL ?? 'redis://localhost:6379')
  const sessionRegistry = createSessionRegistry()
  const roomRegistry = createRoomRegistry()
  const notifications = createNotificationBus()
  const cellLocks = createCellLockManager({ redis, ttlSec: 30 })
  // Aggregate per-tenant quota (I7). Layered above the per-session 30/s bucket so
  // one noisy tenant can't starve others. 500 ops/sec accommodates ~20 active users.
  const tenantBucket = createPerTenantBucket({ capacity: 500, refillPerSec: 500 })
  const presence = createPresenceTracker({ evictAfterMs: 15000 })
  const mutationService = createMutationService({ db })
  const broadcaster = createMutationBroadcaster({
    mutations: mutationService,
    getMaskRulesFor: async (userId, workbookId) => {
      // PermissionAdapter implementations that need a tenantId must resolve it
      // from userId internally — at this layer we only have userId.
      return opts.permission.getMaskRules(
        { userId, tenantId: '' },
        { type: 'workbook', id: workbookId, tenantId: '' },
      )
    },
  })
  presence.startSweep({
    intervalMs: 1000,
    onEvict: (wbId, cid) => {
      const room = roomRegistry.get(wbId)
      room?.broadcast({ type: 'user_left', clientId: cid })
      room?.removeClient(cid)
    },
  })
  return {
    redis,
    sessionRegistry,
    roomRegistry,
    notifications,
    cellLocks,
    tenantBucket,
    presence,
    mutationService,
    broadcaster,
  }
}

export function createServer(opts: CreateServerOpts) {
  const db = createDb(opts.databaseUrl)
  // Either every collab subsystem is constructed (default) or none of them
  // are (single-user mode). The discriminated `undefined` lets every WS-side
  // usage just check `if (collab)` and pick fields off via destructure.
  const collab = opts.collab !== false ? buildCollabInfra(opts, db) : undefined

  const deps: AppDeps = {
    db,
    identity: opts.identity,
    permission: opts.permission,
    storage: opts.storage,
    event: opts.event,
    ...(collab ? { redis: collab.redis, sessionRegistry: collab.sessionRegistry } : {}),
    ...(opts.llm ? { llm: opts.llm } : {}),
  }

  // WS bridge — only registered when collab is enabled. The two-phase wiring
  // (build a temporary nodeWsInit with a lazy app getter, then attach the real
  // built app after buildApp returns) avoids the chicken-and-egg between
  // createNodeWebSocket and buildApp.
  let builtApp: ReturnType<typeof buildApp> | undefined
  let injectWebSocket: ((server: ReturnType<typeof serve>) => void) | undefined
  let wsHandler: ReturnType<ReturnType<typeof createNodeWebSocket>['upgradeWebSocket']> | undefined

  if (collab) {
    const {
      redis,
      sessionRegistry,
      roomRegistry,
      notifications,
      cellLocks,
      tenantBucket,
      presence,
      mutationService,
      broadcaster,
    } = collab

    const nodeWsInit = {
      get app() {
        if (!builtApp) throw new Error('app not built yet')
        return builtApp
      },
    }

    const ws = createNodeWebSocket(nodeWsInit as never)
    injectWebSocket = ws.injectWebSocket
    const { upgradeWebSocket } = ws

    // createEvents MUST be synchronous — any await before nodeUpgradeWebSocket
    // causes the connection waiter to miss wss.handleUpgrade's 'connection' event.
    wsHandler = upgradeWebSocket((c) => {
      const token = c.req.query('token') ?? ''
      const workbookId = c.req.param('workbookId')
      const lastSeqStr = c.req.query('last_seq')
      const lastSeq = lastSeqStr != null && lastSeqStr !== '' ? Number(lastSeqStr) : undefined
      return {
        async onOpen(_e, ws) {
          // Authenticate
          let identity: Awaited<ReturnType<IdentityAdapter['resolveFromToken']>>
          try {
            if (!token) throw new Error('missing token')
            identity = await opts.identity.resolveFromToken(token)
          } catch {
            ws.send(JSON.stringify({ type: 'error', code: 'unauthorized' }))
            ws.close()
            return
          }

          // Authorize
          const cap = await opts.permission.getCapabilities(identity, {
            type: 'workbook',
            id: workbookId,
            tenantId: identity.tenantId,
          })
          if (!cap.canView) {
            ws.send(JSON.stringify({ type: 'error', code: 'forbidden' }))
            ws.close()
            return
          }

          // Send welcome frame (with optional last_seq replay)
          const welcomeDeps = {
            ...deps,
            mutations: mutationService,
            permission: opts.permission,
            presence,
            redis,
          }
          await sendWelcome(ws, welcomeDeps, {
            tenantId: identity.tenantId,
            userId: identity.userId,
            workbookId,
            ...(lastSeq !== undefined ? { lastSeq } : {}),
          })

          // Register client in room and create session dispatcher
          const clientId = crypto.randomUUID()
          const room = roomRegistry.getOrCreate(workbookId)
          room.addClient({
            clientId,
            userId: identity.userId,
            send: (frame) => ws.send(JSON.stringify(frame)),
          })

          // Composite bucket: tenant aggregate gate first, then per-session 30/s.
          const perSession = createTokenBucket({ capacity: 30, refillPerSec: 30 })
          const sessionBucket = {
            take(): boolean {
              return tenantBucket.take(identity.tenantId) && perSession.take()
            },
          }
          const session = createSession(
            {
              ws,
              clientId,
              identity,
              capabilities: cap,
              workbookId,
              room,
              bucket: sessionBucket,
            },
            {
              cellLocks,
              presence,
              broadcaster,
              ...(deps.risk ? { risk: deps.risk } : {}),
              ...(deps.dlpMode ? { dlpMode: deps.dlpMode } : {}),
            },
          )

          // Attach session to the raw WS so onMessage/onClose can reach it
          ;(ws as unknown as Record<string, unknown>)._session = session

          // Register in the in-memory session registry so admin/kick endpoints
          // and the grants DELETE auto-kick path can close this socket out of band.
          const sessionId = clientId
          sessionRegistry.register({
            sessionId,
            userId: identity.userId,
            tenantId: identity.tenantId,
            workbookId,
            openedAt: new Date(),
            close: () => {
              try {
                ws.close()
              } catch {
                /* socket may already be closing */
              }
            },
          })
          ;(ws as unknown as Record<string, unknown>)._sessionId = sessionId

          // Subscribe to in-room notifications (e.g. @mention) and forward to
          // this socket when this user is in the recipients list (or the list is
          // empty, meaning broadcast). Unsubscribe on close.
          if (notifications) {
            const unsubscribe = notifications.subscribe(workbookId, (frame) => {
              if (frame.recipients.length > 0 && !frame.recipients.includes(identity.userId)) {
                return
              }
              try {
                ws.send(JSON.stringify(frame))
              } catch {
                /* socket may be closing */
              }
            })
            ;(ws as unknown as Record<string, unknown>)._notifUnsub = unsubscribe
          }
        },

        onMessage(e, ws) {
          const session = (ws as unknown as Record<string, unknown>)._session as
            | ReturnType<typeof createSession>
            | undefined
          if (!session) return
          const data = typeof e.data === 'string' ? e.data : String(e.data)
          void session.onMessage(data)
        },

        onClose(_e, ws) {
          // Each cleanup step is independently guarded — a throw in any one
          // must not skip the others (otherwise a buggy session.onClose would
          // leak the registry entry and the notification subscription).
          const session = (ws as unknown as Record<string, unknown>)._session as
            | ReturnType<typeof createSession>
            | undefined
          try {
            session?.onClose()
          } catch (err) {
            logger.warn({ err }, 'WS onClose: session.onClose() threw')
          }
          const sessionId = (ws as unknown as Record<string, unknown>)._sessionId as
            | string
            | undefined
          if (sessionId) sessionRegistry.unregister(sessionId)
          const unsub = (ws as unknown as Record<string, unknown>)._notifUnsub as
            | (() => void)
            | undefined
          try {
            unsub?.()
          } catch (err) {
            logger.warn({ err }, 'WS onClose: notification unsubscribe threw')
          }
        },
      }
    })
  } // end of `if (collab)` — WS bridge block

  builtApp = buildApp(
    { ...deps, ...(collab ? { notifications: collab.notifications } : {}) },
    {
      ...(wsHandler
        ? { beforeRoutes: [{ path: '/api/v1/ws/:workbookId', handler: wsHandler }] }
        : {}),
      ...(opts.extraRoutes ? { extraRoutes: opts.extraRoutes } : {}),
    },
  )

  return {
    listen({ port }: { port: number }) {
      return new Promise<{ port: number; close(): Promise<void> }>((resolve) => {
        const server = serve({ fetch: builtApp?.fetch, port }, (info) => {
          if (injectWebSocket) injectWebSocket(server)
          resolve({
            port: info.port,
            close: () =>
              new Promise((r) =>
                server.close(async () => {
                  if (collab) await collab.redis.quit()
                  r()
                }),
              ),
          })
        })
      })
    },
  }
}
