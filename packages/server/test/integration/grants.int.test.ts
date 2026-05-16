import { describe, expect, it } from 'vitest'
import {
  type IdentityAdapter,
  NoopEventAdapter,
  type PermissionAdapter,
} from '../../src/adapters/identity'
import { shareGrants, tenants, workbooks } from '../../src/db/schema'
import { buildApp } from '../../src/http/app'
import { db } from './_dbHelpers'

describe('share grants REST', () => {
  it('POST creates grant; DELETE revokes', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'grants-rest' }).returning()
    const [wb] = await db
      .insert(workbooks)
      .values({ tenantId: tenant.id, ownerId: 'u1', name: 'wb' })
      .returning()
    const identity: IdentityAdapter = {
      resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'u1' }),
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
    const app = buildApp({
      db,
      identity,
      permission,
      storage: { put: async () => {}, get: async () => new Uint8Array(), delete: async () => {} },
      event: new NoopEventAdapter(),
    })

    const post = await app.request('/api/v1/grants', {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: JSON.stringify({
        resourceType: 'workbook',
        resourceId: wb.id,
        granteeType: 'user',
        granteeId: 'guest',
        permission: 'view',
      }),
    })
    expect(post.status).toBe(201)
    const grant = (await post.json()) as { id: string }
    const del = await app.request(`/api/v1/grants/${grant.id}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer x' },
    })
    expect(del.status).toBe(204)
  })

  it('403 when caller lacks canShare', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'grants-403' }).returning()
    const [wb] = await db
      .insert(workbooks)
      .values({ tenantId: tenant.id, ownerId: 'u1', name: 'wb' })
      .returning()
    const identity: IdentityAdapter = {
      resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'u1' }),
    }
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({
        canView: true,
        canEdit: true,
        canShare: false,
        canDelete: false,
      }),
      getMaskRules: async () => [],
    }
    const app = buildApp({
      db,
      identity,
      permission,
      storage: { put: async () => {}, get: async () => new Uint8Array(), delete: async () => {} },
      event: new NoopEventAdapter(),
    })
    const post = await app.request('/api/v1/grants', {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: JSON.stringify({
        resourceType: 'workbook',
        resourceId: wb.id,
        granteeType: 'user',
        granteeId: 'guest',
        permission: 'view',
      }),
    })
    expect(post.status).toBe(403)
  })

  it('DELETE 403 when caller lacks canShare on the grant resource', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'grants-del-403' }).returning()
    const [wb] = await db
      .insert(workbooks)
      .values({ tenantId: tenant.id, ownerId: 'u1', name: 'wb' })
      .returning()
    const [g] = await db
      .insert(shareGrants)
      .values({
        tenantId: tenant.id,
        resourceType: 'workbook',
        resourceId: wb.id,
        granteeType: 'user',
        granteeId: 'guest',
        permission: 'view',
        grantedBy: 'u1',
      })
      .returning()

    const identity: IdentityAdapter = {
      resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'attacker' }),
    }
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({
        canView: true,
        canEdit: false,
        canShare: false,
        canDelete: false,
      }),
      getMaskRules: async () => [],
    }
    const app = buildApp({
      db,
      identity,
      permission,
      storage: { put: async () => {}, get: async () => new Uint8Array(), delete: async () => {} },
      event: new NoopEventAdapter(),
    })
    const del = await app.request(`/api/v1/grants/${g.id}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer x' },
    })
    expect(del.status).toBe(403)
  })

  it('DELETE 204 when caller has canShare on the grant resource', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'grants-del-204' }).returning()
    const [wb] = await db
      .insert(workbooks)
      .values({ tenantId: tenant.id, ownerId: 'u1', name: 'wb' })
      .returning()
    const [g] = await db
      .insert(shareGrants)
      .values({
        tenantId: tenant.id,
        resourceType: 'workbook',
        resourceId: wb.id,
        granteeType: 'user',
        granteeId: 'guest',
        permission: 'view',
        grantedBy: 'u1',
      })
      .returning()

    const identity: IdentityAdapter = {
      resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'owner' }),
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
    const app = buildApp({
      db,
      identity,
      permission,
      storage: { put: async () => {}, get: async () => new Uint8Array(), delete: async () => {} },
      event: new NoopEventAdapter(),
    })
    const del = await app.request(`/api/v1/grants/${g.id}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer x' },
    })
    expect(del.status).toBe(204)
  })
})
