import { describe, expect, it } from 'vitest'
import { buildApp } from '../../src/http/app'
import { db } from './_setup'
import { tenants, workbooks } from '../../src/db/schema'
import { NoopEventAdapter, type IdentityAdapter, type PermissionAdapter } from '../../src/adapters/identity'

function memStorage() {
  const blobs = new Map<string, Uint8Array>()
  return {
    storage: {
      put: async (k: string, b: Uint8Array) => { blobs.set(k, b) },
      get: async (k: string) => blobs.get(k) ?? new Uint8Array(),
      delete: async (k: string) => { blobs.delete(k) },
    },
    blobs,
  }
}

describe('snapshots REST', () => {
  it('POST creates snapshot, GET returns the bytes back', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'snap-t' }).returning()
    const [wb] = await db
      .insert(workbooks)
      .values({ tenantId: tenant.id, ownerId: 'u1', name: 'WB' })
      .returning()

    const ms = memStorage()
    const identity: IdentityAdapter = {
      resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'u1' }),
    }
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({ canView: true, canEdit: true, canShare: true, canDelete: true }),
      getMaskRules: async () => [],
    }
    const app = buildApp({ db, identity, permission, storage: ms.storage, event: new NoopEventAdapter() })

    const payload = new TextEncoder().encode('{"sheets":{}}')
    const post = await app.request(`/api/v1/workbooks/${wb.id}/snapshots`, {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: payload,
    })
    expect(post.status).toBe(201)
    const snap = (await post.json()) as { id: string }

    const get = await app.request(`/api/v1/workbooks/${wb.id}/snapshots/${snap.id}/blob`, {
      headers: { Authorization: 'Bearer x' },
    })
    expect(get.status).toBe(200)
    const body = new Uint8Array(await get.arrayBuffer())
    expect(new TextDecoder().decode(body)).toBe('{"sheets":{}}')
  })
})
