import { describe, expect, it } from 'vitest'
import { db } from './_dbHelpers'
import { tenants } from '../../src/db/schema'
import { buildApp } from '../../src/http/app'
import { NoopEventAdapter, type IdentityAdapter, type PermissionAdapter } from '../../src/adapters/identity'

function buildAllowAll(tenantId: string) {
  const identity: IdentityAdapter = {
    resolveFromToken: async () => ({ tenantId, userId: 'u1' }),
  }
  const permission: PermissionAdapter = {
    getCapabilities: async () => ({ canView: true, canEdit: true, canShare: true, canDelete: true }),
    getMaskRules: async () => [],
  }
  return buildApp({
    db, identity, permission,
    storage: { put: async () => {}, get: async () => new Uint8Array(), delete: async () => {} },
    event: new NoopEventAdapter(),
  })
}

describe('folders REST', () => {
  it('POST → LIST → PATCH rename → DELETE round-trip', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'folders-t' }).returning()
    const app = buildAllowAll(tenant.id)

    const post = await app.request('/api/v1/folders', {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Q1', parentId: null, spaceType: 'personal' }),
    })
    expect(post.status).toBe(201)
    const created = (await post.json()) as { id: string; name: string }
    expect(created.name).toBe('Q1')

    const list = await app.request('/api/v1/folders', { headers: { Authorization: 'Bearer x' } })
    const { items } = (await list.json()) as { items: { id: string }[] }
    expect(items.some((f) => f.id === created.id)).toBe(true)

    const rename = await app.request(`/api/v1/folders/${created.id}`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Q1-2026' }),
    })
    expect(rename.status).toBe(200)

    const del = await app.request(`/api/v1/folders/${created.id}`, {
      method: 'DELETE', headers: { Authorization: 'Bearer x' },
    })
    expect(del.status).toBe(204)
  })

  it('PATCH rejects move that creates a cycle', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'cycle' }).returning()
    const app = buildAllowAll(tenant.id)
    const a = (await (await app.request('/api/v1/folders', {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'a', parentId: null, spaceType: 'personal' }),
    })).json()) as { id: string }
    const b = (await (await app.request('/api/v1/folders', {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'b', parentId: a.id, spaceType: 'personal' }),
    })).json()) as { id: string }
    const move = await app.request(`/api/v1/folders/${a.id}`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: JSON.stringify({ parentId: b.id }),
    })
    expect(move.status).toBe(400)
    expect(((await move.json()) as { error: string }).error).toMatch(/cycle/i)
  })

  it('POST 403 when parentId set + caller lacks canEdit on parent', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'folders-parent-deny' }).returning()
    const identity: IdentityAdapter = { resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'u1' }) }
    const permission: PermissionAdapter = {
      getCapabilities: async (_i, resource) => {
        if (resource.type === 'folder') {
          return { canView: true, canEdit: false, canShare: false, canDelete: false }
        }
        return { canView: true, canEdit: true, canShare: true, canDelete: true }
      },
      getMaskRules: async () => [],
    }
    const app = buildApp({
      db, identity, permission,
      storage: { put: async () => {}, get: async () => new Uint8Array(), delete: async () => {} },
      event: new NoopEventAdapter(),
    })
    const root = (await (await app.request('/api/v1/folders', {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'root', parentId: null, spaceType: 'personal' }),
    })).json()) as { id: string }

    const child = await app.request('/api/v1/folders', {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'child', parentId: root.id, spaceType: 'personal' }),
    })
    expect(child.status).toBe(403)
  })
})
