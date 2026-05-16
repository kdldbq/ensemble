import { sql } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import type { IdentityAdapter, PermissionAdapter } from '../../src/adapters/identity'
import { tenants } from '../../src/db/schema'
import { buildApp } from '../../src/http/app'
import { db } from './_dbHelpers'

describe('audit_log', () => {
  it('POST /workbooks writes workbook.created audit row + fires EventAdapter', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'audit-t' }).returning()
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
    const publish = vi.fn(async () => {})
    const app = buildApp({
      db,
      identity,
      permission,
      storage: { put: async () => {}, get: async () => new Uint8Array(), delete: async () => {} },
      event: { publish },
    })
    await app.request('/api/v1/workbooks', {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'audited' }),
    })
    const rows = await db.execute(
      sql`SELECT event_type FROM audit_log WHERE tenant_id = ${tenant.id}`,
    )
    expect(rows.map((r) => r.event_type)).toContain('workbook.created')
    expect(publish).toHaveBeenCalled()
  })
})
