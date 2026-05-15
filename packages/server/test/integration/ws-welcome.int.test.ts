import { describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { db, dbUrl } from './_dbHelpers'
import { tenants, workbooks } from '../../src/db/schema'
import { createServer } from '../../src/server'
import type { IdentityAdapter, PermissionAdapter } from '../../src/adapters/identity'
import { NoopEventAdapter } from '../../src/adapters/identity'

function memStorage() {
  const blobs = new Map<string, Uint8Array>()
  return {
    put: async (k: string, b: Uint8Array) => { blobs.set(k, b) },
    get: async (k: string) => blobs.get(k) ?? new Uint8Array(),
    delete: async (k: string) => { blobs.delete(k) },
  }
}

/** Connect a WS and collect the first message, then close. */
function wsFirstMessage(url: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.once('message', (data) => {
      const msg = JSON.parse(data.toString()) as Record<string, unknown>
      ws.close()
      resolve(msg)
    })
    ws.once('error', reject)
  })
}

/** Connect a WS and wait for it to close, collecting the first message if any. */
function wsFirstMessageAndClose(url: string): Promise<{ msg: Record<string, unknown> | null; closeCode: number }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    let msg: Record<string, unknown> | null = null
    ws.once('message', (data) => {
      msg = JSON.parse(data.toString()) as Record<string, unknown>
    })
    ws.once('close', (code) => resolve({ msg, closeCode: code }))
    ws.once('error', reject)
  })
}

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
    const handle = await createServer({
      databaseUrl: dbUrl,
      identity,
      permission,
      storage: memStorage(),
      event: new NoopEventAdapter(),
    }).listen({ port: 0 })

    const frame = await wsFirstMessage(`ws://127.0.0.1:${handle.port}/api/v1/ws/${wb.id}?token=ok`)
    expect(frame.type).toBe('welcome')
    await handle.close()
  })

  it('sends error unauthorized and closes when token is invalid', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'ws-unauth' }).returning()
    const [wb] = await db
      .insert(workbooks)
      .values({ tenantId: tenant.id, ownerId: 'u1', name: 'WS-unauth' })
      .returning()
    const identity: IdentityAdapter = {
      resolveFromToken: async () => { throw new Error('bad token') },
    }
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({ canView: true, canEdit: false, canShare: false, canDelete: false }),
      getMaskRules: async () => [],
    }
    const handle = await createServer({
      databaseUrl: dbUrl,
      identity,
      permission,
      storage: memStorage(),
      event: new NoopEventAdapter(),
    }).listen({ port: 0 })

    const { msg } = await wsFirstMessageAndClose(`ws://127.0.0.1:${handle.port}/api/v1/ws/${wb.id}?token=bad`)
    expect(msg).not.toBeNull()
    expect(msg!.type).toBe('error')
    expect(msg!.code).toBe('unauthorized')
    await handle.close()
  })

  it('sends error forbidden and closes when canView is false', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'ws-forbidden' }).returning()
    const [wb] = await db
      .insert(workbooks)
      .values({ tenantId: tenant.id, ownerId: 'u1', name: 'WS-forbidden' })
      .returning()
    const identity: IdentityAdapter = {
      resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'u1' }),
    }
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({ canView: false, canEdit: false, canShare: false, canDelete: false }),
      getMaskRules: async () => [],
    }
    const handle = await createServer({
      databaseUrl: dbUrl,
      identity,
      permission,
      storage: memStorage(),
      event: new NoopEventAdapter(),
    }).listen({ port: 0 })

    const { msg } = await wsFirstMessageAndClose(`ws://127.0.0.1:${handle.port}/api/v1/ws/${wb.id}?token=ok`)
    expect(msg).not.toBeNull()
    expect(msg!.type).toBe('error')
    expect(msg!.code).toBe('forbidden')
    await handle.close()
  })

  it('welcome frame includes snapshot data when a snapshot exists', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'ws-snap' }).returning()
    const [wb] = await db
      .insert(workbooks)
      .values({ tenantId: tenant.id, ownerId: 'u1', name: 'WS-snap' })
      .returning()

    const snapshotBody = new TextEncoder().encode('{"sheets":{}}')
    const storage = memStorage()

    const identity: IdentityAdapter = {
      resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'u1' }),
    }
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({ canView: true, canEdit: true, canShare: false, canDelete: false }),
      getMaskRules: async () => [],
    }

    // First start server and POST a snapshot via HTTP so the db row + blob exist
    const handle = await createServer({
      databaseUrl: dbUrl,
      identity,
      permission,
      storage,
      event: new NoopEventAdapter(),
    }).listen({ port: 0 })

    // Seed the snapshot via the REST API
    const base = `http://127.0.0.1:${handle.port}`
    const postRes = await fetch(`${base}/api/v1/workbooks/${wb.id}/snapshots`, {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: snapshotBody,
    })
    expect(postRes.status).toBe(201)

    // Now connect via WS — welcome frame should contain snapshot
    const frame = await wsFirstMessage(`ws://127.0.0.1:${handle.port}/api/v1/ws/${wb.id}?token=ok`)
    expect(frame.type).toBe('welcome')
    expect(frame.snapshot).not.toBeNull()
    await handle.close()
  })

  it('sends error not_found when workbookId does not exist', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'ws-notfound' }).returning()
    const identity: IdentityAdapter = {
      resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'u1' }),
    }
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({ canView: true, canEdit: false, canShare: false, canDelete: false }),
      getMaskRules: async () => [],
    }
    const handle = await createServer({
      databaseUrl: dbUrl,
      identity,
      permission,
      storage: memStorage(),
      event: new NoopEventAdapter(),
    }).listen({ port: 0 })

    const nonExistentId = '00000000-0000-0000-0000-000000000000'
    const frame = await wsFirstMessage(`ws://127.0.0.1:${handle.port}/api/v1/ws/${nonExistentId}?token=ok`)
    expect(frame.type).toBe('error')
    expect(frame.code).toBe('not_found')
    await handle.close()
  })
})
