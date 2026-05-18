import { Hono } from 'hono'
import { registry } from '../../metrics'
import type { AppEnv } from '../app'

/**
 * Prometheus scrape endpoint. Unauthenticated by design — production deploys
 * should restrict via the reverse proxy (e.g. `allow 10.0.0.0/8; deny all;`
 * in nginx) or expose on a separate internal-only port.
 */
export const metricsRoute = new Hono<AppEnv>().get('/metrics', (c) => {
  const body = registry.render()
  return c.body(body, 200, { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' })
})
