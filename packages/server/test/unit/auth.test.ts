import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import type { IdentityAdapter } from '../../src/adapters/identity'
import { requireIdentity } from '../../src/http/auth'

function appWith(identity: IdentityAdapter) {
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('deps' as never, { identity } as never)
    await next()
  })
  app.use('*', requireIdentity)
  app.get('/me', (c) => c.json(c.get('identity' as never)))
  return app
}

describe('requireIdentity', () => {
  const fakeOk: IdentityAdapter = {
    resolveFromToken: async (t) =>
      t === 'good' ? { tenantId: 't1', userId: 'u1' } : Promise.reject(new Error('bad')),
  }

  it('401 without Authorization header', async () => {
    const res = await appWith(fakeOk).request('/me')
    expect(res.status).toBe(401)
  })

  it('401 when adapter rejects', async () => {
    const res = await appWith(fakeOk).request('/me', { headers: { Authorization: 'Bearer bad' } })
    expect(res.status).toBe(401)
  })

  it('passes identity through on success', async () => {
    const res = await appWith(fakeOk).request('/me', { headers: { Authorization: 'Bearer good' } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ tenantId: 't1', userId: 'u1' })
  })
})
