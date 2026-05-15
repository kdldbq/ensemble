import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import { buildApp, type AppDeps } from './http/app'
import { createDb } from './db/client'
import type { IdentityAdapter, PermissionAdapter, EventAdapter } from './adapters/identity'
import type { StorageAdapter } from './adapters/storage'
import { sendWelcome } from './ws/welcome'

export interface CreateServerOpts {
  databaseUrl: string
  identity: IdentityAdapter
  permission: PermissionAdapter
  storage: StorageAdapter
  event: EventAdapter
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
    nodeWsInit as Parameters<typeof createNodeWebSocket>[0]
  )

  // createEvents MUST be synchronous — any await before nodeUpgradeWebSocket
  // causes the connection waiter to miss wss.handleUpgrade's 'connection' event.
  const wsHandler = upgradeWebSocket((c) => {
    const token = c.req.query('token') ?? ''
    const workbookId = c.req.param('workbookId')
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

        // Send welcome frame
        await sendWelcome(ws, deps, {
          tenantId: identity.tenantId,
          userId: identity.userId,
          workbookId,
        })
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
            close: () => new Promise((r) => server.close(() => r())),
          })
        })
      })
    },
  }
}
