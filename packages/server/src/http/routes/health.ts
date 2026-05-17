import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import type { AppEnv } from '../app'
import { logger } from '../../logger'

const startTime = Date.now()
const VERSION = process.env.npm_package_version ?? '0.0.0'

type CheckStatus = 'ok' | 'fail' | 'skip'

export interface HealthResponse {
  ok: boolean
  version: string
  uptimeSec: number
  checks: {
    db: CheckStatus
    redis: CheckStatus
  }
}

export const healthRoute = new Hono<AppEnv>().get('/healthz', async (c) => {
  const deps = c.get('deps')
  const checks: HealthResponse['checks'] = { db: 'skip', redis: 'skip' }

  try {
    await deps.db.execute(sql`SELECT 1`)
    checks.db = 'ok'
  } catch (err) {
    logger.warn({ err }, 'healthz: db check failed')
    checks.db = 'fail'
  }

  if (deps.redis) {
    try {
      await deps.redis.ping()
      checks.redis = 'ok'
    } catch (err) {
      logger.warn({ err }, 'healthz: redis check failed')
      checks.redis = 'fail'
    }
  }

  const ok = checks.db === 'ok' && checks.redis !== 'fail'
  const body: HealthResponse = {
    ok,
    version: VERSION,
    uptimeSec: Math.floor((Date.now() - startTime) / 1000),
    checks,
  }
  return c.json(body, ok ? 200 : 503)
})
