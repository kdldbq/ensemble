export interface Jwk {
  kid: string
  kty: string
  alg?: string
  use?: string
  n?: string
  e?: string
  [k: string]: unknown
}

export interface JwksCacheOpts {
  jwksUrl: string
  fetch?: typeof fetch
  ttlMs?: number
  refreshCooldownMs?: number
}

export class JwksCache {
  private readonly jwksUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly ttlMs: number
  private readonly refreshCooldownMs: number
  private keysByKid: Map<string, Jwk> = new Map()
  private lastFetchAt = 0

  constructor(opts: JwksCacheOpts) {
    this.jwksUrl = opts.jwksUrl
    this.fetchImpl = opts.fetch ?? globalThis.fetch
    this.ttlMs = opts.ttlMs ?? 60 * 60_000
    this.refreshCooldownMs = opts.refreshCooldownMs ?? 10_000
  }

  async getKey(kid: string): Promise<Jwk> {
    const fetchedAtEntry = this.lastFetchAt
    if (this.shouldRefresh()) await this.fetchKeys()
    const cached = this.keysByKid.get(kid)
    if (cached) return cached
    // kid miss: refresh once if we haven't already fetched during this call
    // or if cooldown has elapsed since last fetch
    const alreadyFetchedThisCall = this.lastFetchAt !== fetchedAtEntry
    if (!alreadyFetchedThisCall || Date.now() - this.lastFetchAt > this.refreshCooldownMs) {
      await this.fetchKeys()
      const after = this.keysByKid.get(kid)
      if (after) return after
    }
    throw new Error(`JwksCache: kid '${kid}' not found in JWKS`)
  }

  private shouldRefresh(): boolean {
    return this.keysByKid.size === 0 || Date.now() - this.lastFetchAt > this.ttlMs
  }

  private async fetchKeys(): Promise<void> {
    const res = await this.fetchImpl(this.jwksUrl)
    if (!res.ok) throw new Error(`JwksCache: ${this.jwksUrl} returned ${res.status}`)
    const body = (await res.json()) as { keys: Jwk[] }
    const next = new Map<string, Jwk>()
    for (const k of body.keys ?? []) {
      if (k.kid) next.set(k.kid, k)
    }
    this.keysByKid = next
    this.lastFetchAt = Date.now()
  }
}
