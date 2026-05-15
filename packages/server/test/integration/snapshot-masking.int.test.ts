import { describe, expect, it } from 'vitest'
import { buildApp } from '../../src/http/app'
import { db } from './_dbHelpers'
import { tenants, workbooks } from '../../src/db/schema'
import { NoopEventAdapter, type IdentityAdapter, type PermissionAdapter } from '../../src/adapters/identity'
import type { MaskRule } from '../../src/adapters/types'

function memStorage() {
  const blobs = new Map<string, Uint8Array>()
  return {
    put: async (k: string, b: Uint8Array) => { blobs.set(k, b) },
    get: async (k: string) => blobs.get(k) ?? new Uint8Array(),
    delete: async (k: string) => { blobs.delete(k) },
  }
}

describe('snapshot masking', () => {
  it('GET /snapshot applies column B redact mask rule', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'mask-t' }).returning()
    const [wb] = await db
      .insert(workbooks)
      .values({ tenantId: tenant.id, ownerId: 'u1', name: 'WB-mask' })
      .returning()

    const storage = memStorage()
    const identity: IdentityAdapter = {
      resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'u1' }),
    }
    const maskRule: MaskRule = {
      match: { type: 'column', sheet: '*', column: 'B' },
      action: { type: 'redact', replacement: '***' },
    }
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({ canView: true, canEdit: true, canShare: true, canDelete: true }),
      getMaskRules: async () => [maskRule],
    }
    const app = buildApp({ db, identity, permission, storage, event: new NoopEventAdapter() })

    // Seed a snapshot with value 999 in column B (index 1)
    const rawData = {
      id: wb.id,
      sheetOrder: ['s1'],
      sheets: {
        s1: {
          id: 's1',
          name: 'Sheet1',
          cellData: {
            '0': { '0': { v: 'name' }, '1': { v: 'secret' } },
            '1': { '0': { v: 'Alice' }, '1': { v: 999 } },
          },
        },
      },
    }
    const payload = new TextEncoder().encode(JSON.stringify(rawData))
    const post = await app.request(`/api/v1/workbooks/${wb.id}/snapshots`, {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: payload,
    })
    expect(post.status).toBe(201)

    // GET /snapshot — should have column B masked as '***'
    const get = await app.request(`/api/v1/workbooks/${wb.id}/snapshot`, {
      headers: { Authorization: 'Bearer x' },
    })
    expect(get.status).toBe(200)
    const body = await get.json() as { sheets: { s1: { cellData: Record<string, Record<string, { v: unknown }>> } } }
    expect(body.sheets.s1.cellData['1']['1'].v).toBe('***')
    // Column A should be untouched
    expect(body.sheets.s1.cellData['1']['0'].v).toBe('Alice')
  })
})
