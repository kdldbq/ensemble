import { describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { db, dbUrl, redisUrl } from './_dbHelpers'
import { tenants, workbooks } from '../../src/db/schema'
import { createServer } from '../../src/server'
import { NoopEventAdapter, type IdentityAdapter, type PermissionAdapter } from '../../src/adapters/identity'
import { createMutationService } from '../../src/services/mutation-service'

describe('Reconnect replay', () => {
  it('replays mutations after last_seq', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'replay' }).returning()
    const [wb] = await db.insert(workbooks).values({ tenantId: tenant.id, ownerId: 'u', name: 'wb' }).returning()
    const mutSvc = createMutationService({ db })
    for (let i = 0; i < 5; i++) {
      await mutSvc.append({ workbookId: wb.id, userId: 'u', payload: { i } })
    }
    const identity: IdentityAdapter = { resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'u' }) }
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({ canView: true, canEdit: true, canShare: true, canDelete: true }),
      getMaskRules: async () => [],
    }
    const handle = await createServer({
      databaseUrl: dbUrl,
      redisUrl: redisUrl(),
      identity, permission,
      storage: { put: async () => {}, get: async () => new Uint8Array(), delete: async () => {} },
      event: new NoopEventAdapter(),
    }).listen({ port: 0 })

    const ws = new WebSocket(`ws://127.0.0.1:${handle.port}/api/v1/ws/${wb.id}?token=t&last_seq=2`)
    const frames: { type: string; seqNum?: number }[] = []
    await new Promise<void>((resolve, reject) => {
      ws.on('message', (data) => {
        const f = JSON.parse(data.toString()) as { type: string; seqNum?: number }
        frames.push(f)
        if (f.type === 'replay_complete') resolve()
      })
      ws.once('error', reject)
    })

    const welcome = frames.find((f) => f.type === 'welcome')!
    expect(welcome.seqNum).toBe(5)
    const replays = frames.filter((f) => f.type === 'apply_mutation')
    expect(replays.map((r) => r.seqNum)).toEqual([3, 4, 5])

    ws.close(); await handle.close()
  })
})
