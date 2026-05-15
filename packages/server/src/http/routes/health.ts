import { Hono } from 'hono'
import type { AppEnv } from '../app'

export const healthRoute = new Hono<AppEnv>().get('/healthz', (c) => c.json({ ok: true }))
