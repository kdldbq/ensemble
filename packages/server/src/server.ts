import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import { buildApp, type AppDeps } from './http/app'
import { createDb } from './db/client'
import type { IdentityAdapter, PermissionAdapter, EventAdapter } from './adapters/identity'
import type { StorageAdapter } from './adapters/storage'
import { sendWelcome } from './ws/welcome'
import { createRedis } from './redis/client'
import { createRoomRegistry } from './realtime/collab-room'
import { createCellLockManager } from './realtime/cell-lock-manager'
import { createPresenceTracker } from './realtime/presence-tracker'
import { createMutationBroadcaster } from './realtime/mutation-broadcaster'
import { createMutationService } from './services/mutation-service'
import { createSession } from './ws/session'
import { createTokenBucket } from './realtime/backpressure'

export interface CreateServerOpts {
  databaseUrl: string
  identity: IdentityAdapter
  permission: PermissionAdapter
  storage: StorageAdapter
  event: EventAdapter
  redisUrl?: string
}

export function createServer(opts: CreateServerOpts) {
  const db = createDb(opts.databaseUrl)
  const deps: AppDeps = {
    db,
    identity: opts.identity,
    permission: opts.permission,
    storage: opts.storage,
    event: opts.event,
  }

  // Realtime infrastructure
  const redis = createRedis(opts.redisUrl ?? process.env['REDIS_URL'] ?? 'redis://localhost:6379')
  const roomRegistry = createRoomRegistry()
  const cellLocks = createCellLockManager({ redis, ttlSec: 30 })
  const presence = createPresenceTracker({ evictAfterMs: 15000 })
  const mutationService = createMutationService({ db })
  const broadcaster = createMutationBroadcaster({
    mutations: mutationService,
    getMaskRulesFor: async (userId, workbookId) => {
      // We need a tenantId to call getMaskRules but at this layer we only have userId.
      // Use a synthetic identity with empty tenantId; PermissionAdapter implementations
      // that need the tenantId should look it up from userId internally.
      return opts.permission.getMaskRules(
        { userId, tenantId: '' },
        { type: 'workbook', id: workbookId, tenantId: '' }
      )
    },
  })

  // Sweep stale presence entries every second
  presence.startSweep({
    intervalMs: 1000,
    onEvict: (wbId, cid) => {
      const room = roomRegistry.get(wbId)
      room?.broadcast({ type: 'user_left', clientId: cid })
      room?.removeClient(cid)
    },
  })

  // We need createNodeWebSocket({ app }) but the app must be fully built first.
  // Use a two-phase approach: build a temporary Hono for createNodeWebSocket,
  // then pass upgradeWebSocket into buildApp's beforeRoutes so the WS route is
  // registered BEFORE sub-routers that have use('*', requireIdentity).
  // injectWebSocket internally calls app.request() on upgrade — we pass the real
  // app to it after build via a wrapper object with a lazy getter.
  let builtApp: ReturnType<typeof buildApp> | undefined

  const nodeWsInit = {
    get app() {
      if (!builtApp) throw new Error('app not built yet')
      return builtApp
    },
  }

  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket(
    nodeWsInit as never
  )

  // createEvents MUST be synchronous — any await before nodeUpgradeWebSocket
  // causes the connection waiter to miss wss.handleUpgrade's 'connection' event.
  const wsHandler = upgradeWebSocket((c) => {
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
        const welcomeDeps = { ...deps, mutations: mutationService, permission: opts.permission }
        await sendWelcome(ws, welcomeDeps, {
          tenantId: identity.tenantId,
          userId: identity.userId,
          workbookId,
          lastSeq,
        })

        // Register client in room and create session dispatcher
        const clientId = crypto.randomUUID()
        const room = roomRegistry.getOrCreate(workbookId)
        room.addClient({
          clientId,
          userId: identity.userId,
          send: (frame) => ws.send(JSON.stringify(frame)),
        })

        const session = createSession(
          {
            ws,
            clientId,
            identity,
            workbookId,
            room,
            bucket: createTokenBucket({ capacity: 30, refillPerSec: 30 }),
          },
          { cellLocks, presence, broadcaster }
        )

        // Attach session to the raw WS so onMessage/onClose can reach it
        ;(ws as unknown as Record<string, unknown>)['_session'] = session
      },

      onMessage(e, ws) {
        const session = (ws as unknown as Record<string, unknown>)['_session'] as
          | ReturnType<typeof createSession>
          | undefined
        if (!session) return
        const data = typeof e.data === 'string' ? e.data : String(e.data)
        void session.onMessage(data)
      },

      onClose(_e, ws) {
        const session = (ws as unknown as Record<string, unknown>)['_session'] as
          | ReturnType<typeof createSession>
          | undefined
        session?.onClose()
      },
    }
  })

  builtApp = buildApp(deps, {
    beforeRoutes: [{ path: '/api/v1/ws/:workbookId', handler: wsHandler }],
  })

  return {
    listen({ port }: { port: number }) {
      return new Promise<{ port: number; close(): Promise<void> }>((resolve) => {
        const server = serve({ fetch: builtApp!.fetch, port }, (info) => {
          injectWebSocket(server)
          resolve({
            port: info.port,
            close: () =>
              new Promise((r) => server.close(async () => {
                await redis.quit()
                r()
              })),
          })
        })
      })
    },
  }
}
