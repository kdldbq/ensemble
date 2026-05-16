import type { AppEnv, Database, StorageAdapter } from '@ensemble-sheets/server'
import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { type Persona, idToPersona } from './persona'
import { ensureSandboxWorkbook, resetDemoData } from './server-bootstrap'

const COOKIE_NAME = 'ev_visitor'
const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 90 // 90 days

export interface DemoRoutesOpts {
  db: Database
  storage: StorageAdapter
  tenantId: string
  publicRoomWbId: string
  /** Required header value on POST /api/demo/reset. If undefined the endpoint stays disabled. */
  resetToken: string | undefined
}

export interface WhoamiResponse {
  userId: string
  persona: Persona
  sandboxWbId: string
  publicRoomWbId: string
}

/**
 * Builds the Hono sub-app mounted under the main ensemble server. Only `/api/demo/*`
 * paths live here so the product API surface stays clean.
 */
export function buildDemoRoutes(opts: DemoRoutesOpts): Hono<AppEnv> {
  const app = new Hono<AppEnv>()

  app.post('/api/demo/whoami', async (c) => {
    // Override priority: ?u= URL param (used by "open another user" links and e2e
    // fixtures) wins over the cookie. Override does NOT issue a cookie, so refreshing
    // the page without ?u= returns the visitor's original identity.
    const override = c.req.query('u')
    let userId: string
    let issueCookie = false
    if (override) {
      userId = override
    } else {
      const fromCookie = getCookie(c, COOKIE_NAME)
      if (fromCookie) {
        userId = fromCookie
      } else {
        // New visitors get the admin persona so they can edit straight away. Visitors
        // who want to feel the viewer (mask) side use the right preview panel or open
        // a separate tab via the "+ Open another user" link.
        userId = `admin-${crypto.randomUUID()}`
        issueCookie = true
      }
    }

    const sandboxWbId = await ensureSandboxWorkbook({
      db: opts.db,
      storage: opts.storage,
      tenantId: opts.tenantId,
      userId,
    })

    if (issueCookie) {
      setCookie(c, COOKIE_NAME, userId, {
        maxAge: COOKIE_MAX_AGE_SEC,
        sameSite: 'Lax',
        httpOnly: false,
        path: '/',
      })
    }

    const body: WhoamiResponse = {
      userId,
      persona: idToPersona(userId),
      sandboxWbId,
      publicRoomWbId: opts.publicRoomWbId,
    }
    return c.json(body)
  })

  app.post('/api/demo/reset', async (c) => {
    if (!opts.resetToken) {
      return c.json({ error: 'reset disabled (no DEMO_RESET_TOKEN configured)' }, 503)
    }
    const provided = c.req.header('x-demo-reset-token') ?? c.req.header('X-Demo-Reset-Token')
    if (provided !== opts.resetToken) {
      return c.json({ error: 'unauthorized' }, 401)
    }
    const result = await resetDemoData({
      db: opts.db,
      tenantId: opts.tenantId,
      publicRoomWbId: opts.publicRoomWbId,
    })
    return c.json({ ok: true, ...result })
  })

  return app
}
