import { describe, expect, it } from 'vitest'
import { buildApp } from '../../src/http/app'
import { db } from './_dbHelpers'
import {
  NotImplementedIdentityAdapter,
  NotImplementedPermissionAdapter,
  NoopEventAdapter,
} from '../../src/adapters/identity'

describe('GET /healthz', () => {
  it('returns ok json', async () => {
    const app = buildApp({
      db,
      identity: new NotImplementedIdentityAdapter(),
      permission: new NotImplementedPermissionAdapter(),
      storage: { put: async () => {}, get: async () => new Uint8Array(), delete: async () => {} },
      event: new NoopEventAdapter(),
    })
    const res = await app.request('/healthz')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})
