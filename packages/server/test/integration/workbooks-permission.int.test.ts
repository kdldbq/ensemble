import { describe, expect, it } from 'vitest'
import {
  type IdentityAdapter,
  NoopEventAdapter,
  type PermissionAdapter,
} from '../../src/adapters/identity'
import { tenants, workbooks } from '../../src/db/schema'
import { buildApp } from '../../src/http/app'
import { db } from './_dbHelpers'

function buildWithPerm(
  tenantId: string,
  cap: Partial<{ canView: boolean; canEdit: boolean; canShare: boolean; canDelete: boolean }>,
) {
  const identity: IdentityAdapter = { resolveFromToken: async () => ({ tenantId, userId: 'u1' }) }
  const permission: PermissionAdapter = {
    getCapabilities: async () => ({
      canView: false,
      canEdit: false,
      canShare: false,
      canDelete: false,
      ...cap,
    }),
    getMaskRules: async () => [],
  }
  return buildApp({
    db,
    identity,
    permission,
    storage: { put: async () => {}, get: async () => new Uint8Array(), delete: async () => {} },
    event: new NoopEventAdapter(),
  })
}

describe('workbook + snapshot route permission enforcement', () => {
  it('403 GET workbook when canView is false', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'p1' }).returning()
    const [wb] = await db
      .insert(workbooks)
      .values({ tenantId: tenant.id, ownerId: 'u', name: 'wb' })
      .returning()
    const app = buildWithPerm(tenant.id, {})
    const res = await app.request(`/api/v1/workbooks/${wb.id}`, {
      headers: { Authorization: 'Bearer x' },
    })
    expect(res.status).toBe(403)
  })

  it('403 POST snapshot when canEdit is false', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'p2' }).returning()
    const [wb] = await db
      .insert(workbooks)
      .values({ tenantId: tenant.id, ownerId: 'u', name: 'wb' })
      .returning()
    const app = buildWithPerm(tenant.id, { canView: true })
    const res = await app.request(`/api/v1/workbooks/${wb.id}/snapshots`, {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: new TextEncoder().encode('{}'),
    })
    expect(res.status).toBe(403)
  })

  it('403 DELETE workbook when canDelete is false', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'p3' }).returning()
    const [wb] = await db
      .insert(workbooks)
      .values({ tenantId: tenant.id, ownerId: 'u', name: 'wb' })
      .returning()
    const app = buildWithPerm(tenant.id, { canView: true, canEdit: true })
    const res = await app.request(`/api/v1/workbooks/${wb.id}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer x' },
    })
    expect(res.status).toBe(403)
  })
})
