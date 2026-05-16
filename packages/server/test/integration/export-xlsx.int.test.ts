import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  type IdentityAdapter,
  NoopEventAdapter,
  type PermissionAdapter,
} from '../../src/adapters/identity'
import { tenants, workbooks } from '../../src/db/schema'
import { buildApp } from '../../src/http/app'
import { db } from './_dbHelpers'

describe('GET .xlsx', () => {
  it('returns xlsx with latest snapshot data', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'xlsx-t' }).returning()
    const [wb] = await db
      .insert(workbooks)
      .values({ tenantId: tenant?.id, ownerId: 'u', name: 'wb' })
      .returning()
    const blobs = new Map<string, Uint8Array>()
    const identity: IdentityAdapter = {
      resolveFromToken: async () => ({ tenantId: tenant?.id, userId: 'u' }),
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

    const payload = {
      id: wb?.id,
      sheetOrder: ['s1'],
      sheets: {
        s1: {
          id: 's1',
          name: 'G',
          cellData: {
            '0': { '0': { v: 'Name' }, '1': { v: 'Score' } },
            '1': { '0': { v: 'Alice' }, '1': { v: 90 } },
          },
        },
      },
    }
    await app.request(`/api/v1/workbooks/${wb?.id}/snapshots?reason=manual`, {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: new TextEncoder().encode(JSON.stringify(payload)),
    })

    const res = await app.request(`/api/v1/workbooks/${wb?.id}/export.xlsx`, {
      headers: { Authorization: 'Bearer x' },
    })
    expect(res.status).toBe(200)
    const xlsxBytes = new Uint8Array(await res.arrayBuffer())
    const wbBack = XLSX.read(xlsxBytes, { type: 'array' })
    const aoa = XLSX.utils.sheet_to_json(wbBack.Sheets[wbBack.SheetNames[0]!]!, { header: 1 })
    expect(aoa).toEqual([
      ['Name', 'Score'],
      ['Alice', 90],
    ])
  })
})
