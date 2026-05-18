import { describe, expect, it } from 'vitest'
import type { IdentityAdapter, PermissionAdapter } from '../../src/adapters/identity'
import { NoopEventAdapter } from '../../src/adapters/identity'
import { tenants } from '../../src/db/schema'
import { buildApp } from '../../src/http/app'
import { db } from './_dbHelpers'

function deps(identity: IdentityAdapter) {
  const permission: PermissionAdapter = {
    getCapabilities: async () => ({
      canView: true,
      canEdit: true,
      canShare: true,
      canDelete: true,
    }),
    getMaskRules: async () => [],
  }
  return {
    db,
    identity,
    permission,
    storage: { put: async () => {}, get: async () => new Uint8Array(), delete: async () => {} },
    event: new NoopEventAdapter(),
  }
}

describe('workbooks REST', () => {
  it('POST creates and GET returns the workbook', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'acme' }).returning()
    const identity: IdentityAdapter = {
      resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'u1' }),
    }
    const app = buildApp(deps(identity))

    const created = await app.request('/api/v1/workbooks', {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Grades' }),
    })
    expect(created.status).toBe(201)
    const wb = (await created.json()) as { id: string; name: string }
    expect(wb.name).toBe('Grades')

    const got = await app.request(`/api/v1/workbooks/${wb.id}`, {
      headers: { Authorization: 'Bearer x' },
    })
    expect(got.status).toBe(200)
    expect(((await got.json()) as { id: string }).id).toBe(wb.id)
  })

  it('LIST returns only my tenant', async () => {
    const [a] = await db.insert(tenants).values({ name: 't-a' }).returning()
    const [b] = await db.insert(tenants).values({ name: 't-b' }).returning()
    const idA: IdentityAdapter = {
      resolveFromToken: async () => ({ tenantId: a.id, userId: 'u1' }),
    }
    const idB: IdentityAdapter = {
      resolveFromToken: async () => ({ tenantId: b.id, userId: 'u2' }),
    }
    const appA = buildApp(deps(idA))
    const appB = buildApp(deps(idB))
    await appA.request('/api/v1/workbooks', {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'A-only' }),
    })
    const list = await appB.request('/api/v1/workbooks', { headers: { Authorization: 'Bearer x' } })
    const items = (await list.json()) as { items: unknown[] }
    expect(items.items.length).toBe(0)
  })

  it('POST without name returns 400 name required', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'no-name' }).returning()
    const identity: IdentityAdapter = {
      resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'u1' }),
    }
    const app = buildApp(deps(identity))

    const res = await app.request('/api/v1/workbooks', {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('name required')
  })

  it('DELETE soft-deletes and subsequent GET returns 404', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'del' }).returning()
    const identity: IdentityAdapter = {
      resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'u1' }),
    }
    const app = buildApp(deps(identity))
    const created = await app.request('/api/v1/workbooks', {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'doomed' }),
    })
    const wb = (await created.json()) as { id: string }
    const del = await app.request(`/api/v1/workbooks/${wb.id}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer x' },
    })
    expect(del.status).toBe(204)
    const got = await app.request(`/api/v1/workbooks/${wb.id}`, {
      headers: { Authorization: 'Bearer x' },
    })
    expect(got.status).toBe(404)
  })
})
