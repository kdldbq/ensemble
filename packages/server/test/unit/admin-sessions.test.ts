import { describe, expect, it, vi } from 'vitest'
import {
  type IdentityAdapter,
  NoopEventAdapter,
  type PermissionAdapter,
} from '../../src/adapters/identity'
import type { AppDeps } from '../../src/http/app'
import { buildApp } from '../../src/http/app'
import { createSessionRegistry } from '../../src/realtime/session-registry'

const permission: PermissionAdapter = {
  getCapabilities: async () => ({
    canView: true,
    canEdit: true,
    canShare: true,
    canDelete: true,
  }),
  getMaskRules: async () => [],
}

const stubDb = {} as AppDeps['db']

function depsFor(tenantId: string, userId: string, sessionRegistry: AppDeps['sessionRegistry']) {
  const identity: IdentityAdapter = {
    resolveFromToken: async () => ({ tenantId, userId }),
  }
  return {
    db: stubDb,
    identity,
    permission,
    storage: { put: async () => {}, get: async () => new Uint8Array(), delete: async () => {} },
    event: new NoopEventAdapter(),
    sessionRegistry,
  } satisfies AppDeps
}

describe('GET /api/v1/admin/sessions', () => {
  it('returns active sessions filtered by caller tenant', async () => {
    const reg = createSessionRegistry()
    reg.register({
      sessionId: 's1',
      userId: 'u1',
      tenantId: 't1',
      workbookId: 'wb1',
      openedAt: new Date('2026-05-18T00:00:00Z'),
      close: vi.fn(),
    })
    reg.register({
      sessionId: 's2',
      userId: 'u2',
      tenantId: 't2',
      workbookId: 'wb2',
      openedAt: new Date('2026-05-18T00:00:00Z'),
      close: vi.fn(),
    })

    const app = buildApp(depsFor('t1', 'admin', reg))
    const res = await app.request('/api/v1/admin/sessions', {
      headers: { Authorization: 'Bearer x' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      sessions: Array<{ sessionId: string; userId: string; workbookId: string; openedAt: string }>
    }
    expect(body.sessions.map((s) => s.sessionId).sort()).toEqual(['s1'])
    expect(body.sessions[0]).toMatchObject({ userId: 'u1', workbookId: 'wb1' })
  })

  it('returns empty list when registry is absent', async () => {
    const app = buildApp({ ...depsFor('t1', 'admin', undefined), sessionRegistry: undefined })
    const res = await app.request('/api/v1/admin/sessions', {
      headers: { Authorization: 'Bearer x' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { sessions: unknown[] }
    expect(body.sessions).toEqual([])
  })
})

describe('POST /api/v1/admin/sessions/:id/kick', () => {
  it('kicks an in-tenant session and returns 204', async () => {
    const reg = createSessionRegistry()
    const close = vi.fn()
    reg.register({
      sessionId: 's1',
      userId: 'u1',
      tenantId: 't1',
      workbookId: 'wb1',
      openedAt: new Date('2026-05-18T00:00:00Z'),
      close,
    })
    const app = buildApp(depsFor('t1', 'admin', reg))
    const res = await app.request('/api/v1/admin/sessions/s1/kick', {
      method: 'POST',
      headers: { Authorization: 'Bearer x' },
    })
    expect(res.status).toBe(204)
    expect(close).toHaveBeenCalledTimes(1)
    expect(reg.get('s1')).toBeUndefined()
  })

  it('returns 404 when sessionId is unknown', async () => {
    const reg = createSessionRegistry()
    const app = buildApp(depsFor('t1', 'admin', reg))
    const res = await app.request('/api/v1/admin/sessions/missing/kick', {
      method: 'POST',
      headers: { Authorization: 'Bearer x' },
    })
    expect(res.status).toBe(404)
  })

  it('returns 404 when sessionId belongs to a different tenant (no existence leak)', async () => {
    const reg = createSessionRegistry()
    const close = vi.fn()
    reg.register({
      sessionId: 's1',
      userId: 'u1',
      tenantId: 'other-tenant',
      workbookId: 'wb1',
      openedAt: new Date('2026-05-18T00:00:00Z'),
      close,
    })
    const app = buildApp(depsFor('t1', 'admin', reg))
    const res = await app.request('/api/v1/admin/sessions/s1/kick', {
      method: 'POST',
      headers: { Authorization: 'Bearer x' },
    })
    expect(res.status).toBe(404)
    expect(close).not.toHaveBeenCalled()
    expect(reg.get('s1')).toBeDefined()
  })

  it('returns 503 when sessionRegistry is not configured on this server', async () => {
    const app = buildApp(depsFor('t1', 'admin', undefined))
    const res = await app.request('/api/v1/admin/sessions/anything/kick', {
      method: 'POST',
      headers: { Authorization: 'Bearer x' },
    })
    expect(res.status).toBe(503)
  })
})
