import type { Context, MiddlewareHandler } from 'hono'
import type { Capability, ResourceRef } from '../adapters/types'
import { logger } from '../logger'
import type { AppEnv } from './app'

export type CapabilityName = keyof Capability

export function requireCapability(
  cap: CapabilityName,
  resourceOf: (c: Context<AppEnv>) => ResourceRef | Promise<ResourceRef>,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const identity = c.get('identity')
    if (!identity) return c.json({ error: 'unauthorized' }, 401)
    const deps = c.get('deps')
    try {
      const ref = await resourceOf(c)
      const capabilities = await deps.permission.getCapabilities(
        identity as Parameters<typeof deps.permission.getCapabilities>[0],
        ref,
      )
      if (!capabilities[cap]) return c.json({ error: 'forbidden' }, 403)
      c.set('capabilities', capabilities)
      await next()
    } catch (err) {
      logger.error({ err }, 'PermissionAdapter.getCapabilities failed')
      return c.json({ error: 'permission check failed' }, 500)
    }
  }
}
