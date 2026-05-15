import { importJWK, jwtVerify } from 'jose'
import type { IdentityAdapter, IdentityContext } from '@ensemble/server'
import { JwksCache, type Jwk } from './jwks-cache'

export interface JwksIdentityOpts {
  jwksUrl: string
  issuer: string
  audience: string
  fetch?: typeof fetch
  ttlMs?: number
  tenantClaim?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class JwksIdentityAdapter implements IdentityAdapter {
  private readonly cache: JwksCache
  private readonly issuer: string
  private readonly audience: string
  private readonly tenantClaim: string

  constructor(opts: JwksIdentityOpts) {
    this.cache = new JwksCache({
      jwksUrl: opts.jwksUrl,
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
      ...(opts.ttlMs !== undefined ? { ttlMs: opts.ttlMs } : {}),
    })
    this.issuer = opts.issuer
    this.audience = opts.audience
    this.tenantClaim = opts.tenantClaim ?? 'tenant_id'
  }

  async resolveFromToken(token: string): Promise<IdentityContext> {
    const { payload } = await jwtVerify(
      token,
      async (header) => {
        if (!header.kid) throw new Error('JWT missing kid header')
        const jwk = await this.cache.getKey(header.kid)
        return (await importJWK(jwk as Jwk, header.alg ?? 'RS256')) as CryptoKey
      },
      { issuer: this.issuer, audience: this.audience },
    )

    const p = payload as Record<string, unknown>
    const tenantId = p[this.tenantClaim]
    if (typeof tenantId !== 'string' || !UUID_RE.test(tenantId)) {
      throw new Error(`JwksIdentityAdapter: ${this.tenantClaim} claim missing or not a uuid`)
    }
    const userId = payload.sub
    if (!userId) throw new Error('JwksIdentityAdapter: sub claim required')

    const ctx: IdentityContext = { tenantId, userId }
    if (typeof p.email === 'string') ctx.email = p.email
    if (typeof p.name === 'string') ctx.displayName = p.name
    if (Array.isArray(p.roles)) ctx.roles = p.roles.filter((r): r is string => typeof r === 'string')
    return ctx
  }
}
