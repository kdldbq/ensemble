import { describe, expect, it } from 'vitest'
import {
  NoopEventAdapter,
  NotImplementedIdentityAdapter,
  NotImplementedPermissionAdapter,
} from '../../src/adapters/identity'
import { buildApp } from '../../src/http/app'
import { db } from './_dbHelpers'

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
    const body = (await res.json()) as {
      ok: boolean
      version: string
      uptimeSec: number
      checks: { db: string; redis: string }
    }
    expect(body.ok).toBe(true)
    expect(body.checks.db).toBe('ok')
    expect(body.checks.redis).toBe('skip')
    expect(typeof body.version).toBe('string')
    expect(typeof body.uptimeSec).toBe('number')
  })
})
