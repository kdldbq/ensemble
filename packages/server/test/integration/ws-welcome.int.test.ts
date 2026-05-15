import { describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { db, dbUrl } from './_setup'
import { tenants, workbooks } from '../../src/db/schema'
import { createServer } from '../../src/server'
import type { IdentityAdapter, PermissionAdapter } from '../../src/adapters/identity'
import { NoopEventAdapter } from '../../src/adapters/identity'

describe('WS welcome', () => {
  it('sends a welcome frame after connecting with a valid token', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'ws-t' }).returning()
    const [wb] = await db
      .insert(workbooks)
      .values({ tenantId: tenant.id, ownerId: 'u1', name: 'WS' })
      .returning()
    const identity: IdentityAdapter = {
      resolveFromToken: async (t) => {
        if (t !== 'ok') throw new Error('bad')
        return { tenantId: tenant.id, userId: 'u1' }
      },
    }
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({ canView: true, canEdit: false, canShare: false, canDelete: false }),
      getMaskRules: async () => [],
    }
    const memBlobs = new Map<string, Uint8Array>()
    const storage = {
      put: async (k: string, b: Uint8Array) => { memBlobs.set(k, b) },
      get: async (k: string) => memBlobs.get(k) ?? new Uint8Array(),
      delete: async (k: string) => { memBlobs.delete(k) },
    }
    const handle = await createServer({
      databaseUrl: dbUrl,
      identity,
      permission,
      storage,
      event: new NoopEventAdapter(),
    }).listen({ port: 0 })

    const ws = new WebSocket(`ws://127.0.0.1:${handle.port}/api/v1/ws/${wb.id}?token=ok`)
    const frame: { type: string; snapshot: unknown } = await new Promise((resolve, reject) => {
      ws.once('message', (data) => resolve(JSON.parse(data.toString())))
      ws.once('error', reject)
    })
    expect(frame.type).toBe('welcome')
    ws.close()
    await handle.close()
  })
})
