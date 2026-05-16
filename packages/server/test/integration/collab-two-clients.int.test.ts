import { describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import {
  type IdentityAdapter,
  NoopEventAdapter,
  type PermissionAdapter,
} from '../../src/adapters/identity'
import { tenants, workbooks } from '../../src/db/schema'
import { createServer } from '../../src/server'
import { db, dbUrl, redisUrl } from './_dbHelpers'

async function connectAndAwaitWelcome(url: string) {
  const ws = new WebSocket(url)
  await new Promise<void>((resolve, reject) => {
    ws.once('message', () => resolve())
    ws.once('error', reject)
  })
  return ws
}

async function nextFrameMatching(
  ws: WebSocket,
  predicate: (f: { type: string }) => boolean,
): Promise<{ type: string } & Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const onMsg = (data: WebSocket.RawData) => {
      const frame = JSON.parse(data.toString()) as { type: string } & Record<string, unknown>
      if (predicate(frame)) {
        ws.off('message', onMsg)
        resolve(frame)
      }
    }
    ws.on('message', onMsg)
    ws.once('error', reject)
  })
}

describe('2-client collab', () => {
  it('B sees apply_mutation after A submits', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'collab2' }).returning()
    const [wb] = await db
      .insert(workbooks)
      .values({ tenantId: tenant.id, ownerId: 'a', name: 'wb' })
      .returning()

    const identity: IdentityAdapter = {
      resolveFromToken: async (t) => ({ tenantId: tenant.id, userId: t === 'tokA' ? 'a' : 'b' }),
    }
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({
        canView: true,
        canEdit: true,
        canShare: true,
        canDelete: true,
      }),
      getMaskRules: async () => [],
    }
    const handle = await createServer({
      databaseUrl: dbUrl,
      redisUrl: redisUrl(),
      identity,
      permission,
      storage: { put: async () => {}, get: async () => new Uint8Array(), delete: async () => {} },
      event: new NoopEventAdapter(),
    }).listen({ port: 0 })

    const wsA = await connectAndAwaitWelcome(
      `ws://127.0.0.1:${handle.port}/api/v1/ws/${wb.id}?token=tokA`,
    )
    const wsB = await connectAndAwaitWelcome(
      `ws://127.0.0.1:${handle.port}/api/v1/ws/${wb.id}?token=tokB`,
    )

    wsA.send(JSON.stringify({ type: 'acquire_lock', region: 'B5:B5' }))
    await nextFrameMatching(wsA, (f) => f.type === 'lock_granted')

    wsA.send(
      JSON.stringify({
        type: 'submit_mutation',
        clientSeq: 1,
        region: 'B5:B5',
        payload: { op: 'set', cell: 'B5', value: 85 },
      }),
    )

    const onA = await nextFrameMatching(wsA, (f) => f.type === 'mutation_accepted')
    const onB = await nextFrameMatching(wsB, (f) => f.type === 'apply_mutation')

    expect(onA.seqNum).toBe(1)
    expect((onB as { seqNum: number; userId: string }).seqNum).toBe(1)
    expect((onB as { userId: string }).userId).toBe('a')

    wsA.close()
    wsB.close()
    await handle.close()
  })
})
