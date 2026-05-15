import { describe, expect, it } from 'vitest'
import { db } from './_dbHelpers'
import { tenants, workbooks } from '../../src/db/schema'
import { buildApp } from '../../src/http/app'
import { NoopEventAdapter, type IdentityAdapter, type PermissionAdapter } from '../../src/adapters/identity'

describe('share grants REST', () => {
  it('POST creates grant; DELETE revokes', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'grants-rest' }).returning()
    const [wb] = await db.insert(workbooks).values({ tenantId: tenant.id, ownerId: 'u1', name: 'wb' }).returning()
    const identity: IdentityAdapter = { resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'u1' }) }
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({ canView: true, canEdit: true, canShare: true, canDelete: true }),
      getMaskRules: async () => [],
    }
    const app = buildApp({
      db, identity, permission,
      storage: { put: async () => {}, get: async () => new Uint8Array(), delete: async () => {} },
      event: new NoopEventAdapter(),
    })

    const post = await app.request('/api/v1/grants', {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: JSON.stringify({
        resourceType: 'workbook', resourceId: wb.id,
        granteeType: 'user', granteeId: 'guest', permission: 'view',
      }),
    })
    expect(post.status).toBe(201)
    const grant = (await post.json()) as { id: string }
    const del = await app.request(`/api/v1/grants/${grant.id}`, {
      method: 'DELETE', headers: { Authorization: 'Bearer x' },
    })
    expect(del.status).toBe(204)
  })

  it('403 when caller lacks canShare', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'grants-403' }).returning()
    const [wb] = await db.insert(workbooks).values({ tenantId: tenant.id, ownerId: 'u1', name: 'wb' }).returning()
    const identity: IdentityAdapter = { resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'u1' }) }
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({ canView: true, canEdit: true, canShare: false, canDelete: false }),
      getMaskRules: async () => [],
    }
    const app = buildApp({
      db, identity, permission,
      storage: { put: async () => {}, get: async () => new Uint8Array(), delete: async () => {} },
      event: new NoopEventAdapter(),
    })
    const post = await app.request('/api/v1/grants', {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: JSON.stringify({
        resourceType: 'workbook', resourceId: wb.id,
        granteeType: 'user', granteeId: 'guest', permission: 'view',
      }),
    })
    expect(post.status).toBe(403)
  })
})
