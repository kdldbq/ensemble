import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/server-bootstrap', () => ({
  ensureSandboxWorkbook: vi.fn(),
  resetDemoData: vi.fn(),
}))

import * as bootstrap from '../src/server-bootstrap'
import { buildDemoRoutes } from '../src/server-demo-routes'

const ensureSandboxWorkbookMock = bootstrap.ensureSandboxWorkbook as ReturnType<typeof vi.fn>
const resetDemoDataMock = bootstrap.resetDemoData as ReturnType<typeof vi.fn>

const TENANT = '00000000-0000-0000-0000-000000000001'
const PUBLIC_WB = '00000000-0000-0000-0000-000000000099'
const SANDBOX_WB = 'sandbox-fixture-id'

function buildApp(opts: { resetToken?: string | undefined } = { resetToken: 'test-token' }) {
  return buildDemoRoutes({
    db: {} as never,
    storage: {} as never,
    tenantId: TENANT,
    publicRoomWbId: PUBLIC_WB,
    resetToken: opts.resetToken,
  })
}

beforeEach(() => {
  ensureSandboxWorkbookMock.mockReset()
  ensureSandboxWorkbookMock.mockResolvedValue(SANDBOX_WB)
  resetDemoDataMock.mockReset()
  resetDemoDataMock.mockResolvedValue({ workbooksDeleted: 3, foldersDeleted: 2 })
})

describe('POST /api/demo/whoami', () => {
  it('issues a new visitor cookie when none exists', async () => {
    const app = buildApp()
    const res = await app.request('/api/demo/whoami', { method: 'POST' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { userId: string; persona: string; sandboxWbId: string }
    expect(body.userId).toMatch(/^visitor-/)
    expect(body.sandboxWbId).toBe(SANDBOX_WB)
    expect(['admin', 'editor', 'viewer']).toContain(body.persona)
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toMatch(/ev_visitor=visitor-/)
  })

  it('reuses the visitor id from the cookie', async () => {
    const app = buildApp()
    const res = await app.request('/api/demo/whoami', {
      method: 'POST',
      headers: { cookie: 'ev_visitor=visitor-repeat-1' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { userId: string }
    expect(body.userId).toBe('visitor-repeat-1')
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(ensureSandboxWorkbookMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'visitor-repeat-1', tenantId: TENANT }),
    )
  })

  it('honors ?u= override and does NOT issue cookie', async () => {
    const app = buildApp()
    const res = await app.request('/api/demo/whoami?u=editor-fixture-1', {
      method: 'POST',
    })
    const body = (await res.json()) as { userId: string; persona: string }
    expect(body.userId).toBe('editor-fixture-1')
    expect(body.persona).toBe('editor')
    expect(res.headers.get('set-cookie')).toBeNull()
  })
})

describe('POST /api/demo/reset', () => {
  it('returns 503 when no token configured', async () => {
    const app = buildApp({ resetToken: undefined })
    const res = await app.request('/api/demo/reset', { method: 'POST' })
    expect(res.status).toBe(503)
    expect(resetDemoDataMock).not.toHaveBeenCalled()
  })

  it('returns 401 when token mismatches', async () => {
    const app = buildApp({ resetToken: 'correct' })
    const res = await app.request('/api/demo/reset', {
      method: 'POST',
      headers: { 'x-demo-reset-token': 'wrong' },
    })
    expect(res.status).toBe(401)
    expect(resetDemoDataMock).not.toHaveBeenCalled()
  })

  it('wipes data and reports counts when token matches', async () => {
    const app = buildApp({ resetToken: 'right' })
    const res = await app.request('/api/demo/reset', {
      method: 'POST',
      headers: { 'x-demo-reset-token': 'right' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; workbooksDeleted: number }
    expect(body.ok).toBe(true)
    expect(body.workbooksDeleted).toBe(3)
    expect(resetDemoDataMock).toHaveBeenCalledWith({
      db: expect.anything(),
      tenantId: TENANT,
      publicRoomWbId: PUBLIC_WB,
    })
  })
})
