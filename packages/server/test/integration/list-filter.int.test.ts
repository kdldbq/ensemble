import { describe, expect, it } from 'vitest'
import { db } from './_dbHelpers'
import { tenants, workbooks } from '../../src/db/schema'
import { buildApp } from '../../src/http/app'
import { NoopEventAdapter, type IdentityAdapter, type PermissionAdapter } from '../../src/adapters/identity'

describe('filterListVisibility', () => {
  it('hides workbooks not in allowedIds', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'list-filter' }).returning()
    const [wb1] = await db.insert(workbooks).values({ tenantId: tenant.id, ownerId: 'u', name: 'visible' }).returning()
    await db.insert(workbooks).values({ tenantId: tenant.id, ownerId: 'u', name: 'hidden' })
    const identity: IdentityAdapter = { resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'u' }) }
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({ canView: true, canEdit: true, canShare: true, canDelete: true }),
      getMaskRules: async () => [],
      filterListVisibility: async (_id, scope) => scope === 'workbooks' ? { allowedIds: [wb1.id] } : {},
    }
    const app = buildApp({
      db, identity, permission,
      storage: { put: async () => {}, get: async () => new Uint8Array(), delete: async () => {} },
      event: new NoopEventAdapter(),
    })
    const res = await app.request('/api/v1/workbooks', { headers: { Authorization: 'Bearer x' } })
    const { items } = (await res.json()) as { items: { id: string }[] }
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe(wb1.id)
  })
})
