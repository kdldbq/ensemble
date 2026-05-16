import { describe, expect, it } from 'vitest'
import {
  type IdentityAdapter,
  NoopEventAdapter,
  type PermissionAdapter,
} from '../../src/adapters/identity'
import { tenants, workbooks } from '../../src/db/schema'
import { buildApp } from '../../src/http/app'
import { db } from './_dbHelpers'

function buildAllowAll(tenantId: string) {
  const identity: IdentityAdapter = { resolveFromToken: async () => ({ tenantId, userId: 'u1' }) }
  const permission: PermissionAdapter = {
    getCapabilities: async () => ({
      canView: true,
      canEdit: true,
      canShare: true,
      canDelete: true,
    }),
    getMaskRules: async () => [],
  }
  const blobs = new Map<string, Uint8Array>()
  return buildApp({
    db,
    identity,
    permission,
    storage: {
      put: async (k, b) => {
        blobs.set(k, b)
      },
      get: async (k) => blobs.get(k) ?? new Uint8Array(),
      delete: async (k) => {
        blobs.delete(k)
      },
    },
    event: new NoopEventAdapter(),
  })
}

describe('versions REST', () => {
  it('snapshot → named version → list → restore', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'versions-t' }).returning()
    const [wb] = await db
      .insert(workbooks)
      .values({ tenantId: tenant.id, ownerId: 'u1', name: 'wb' })
      .returning()
    const app = buildAllowAll(tenant.id)

    await app.request(`/api/v1/workbooks/${wb.id}/snapshots?reason=manual`, {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: new TextEncoder().encode('{"sheets":{}}'),
    })

    const named = await app.request(`/api/v1/workbooks/${wb.id}/versions`, {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'V1' }),
    })
    expect(named.status).toBe(201)
    const ns = (await named.json()) as { id: string; name: string }
    expect(ns.name).toBe('V1')

    const list = await app.request(`/api/v1/workbooks/${wb.id}/versions`, {
      headers: { Authorization: 'Bearer x' },
    })
    const { items } = (await list.json()) as { items: { id: string }[] }
    expect(items.some((s) => s.id === ns.id)).toBe(true)

    const restore = await app.request(`/api/v1/workbooks/${wb.id}/restore/${ns.id}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer x' },
    })
    expect(restore.status).toBe(201)
  })
})
