import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from './app'

export const requireIdentity: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header('Authorization')
  if (!header?.startsWith('Bearer ')) return c.json({ error: 'unauthorized' }, 401)
  const token = header.slice('Bearer '.length).trim()
  if (!token) return c.json({ error: 'unauthorized' }, 401)
  try {
    const id = await c.get('deps').identity.resolveFromToken(token)
    c.set('identity', { tenantId: id.tenantId, userId: id.userId })
    await next()
  } catch {
    return c.json({ error: 'unauthorized' }, 401)
  }
}
