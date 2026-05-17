import { type BucketOpts, type TokenBucket, createTokenBucket } from './backpressure'

export interface PerTenantBucketOpts extends BucketOpts {
  /**
   * Idle buckets are dropped from the map after this many ms with zero takes.
   * Defaults to 5 minutes. Keeps memory bounded for ephemeral tenants while
   * letting active tenants reuse the same bucket across reconnects.
   */
  idleEvictMs?: number
}

interface Entry {
  bucket: TokenBucket
  lastUsed: number
}

/**
 * Aggregate per-tenant quota layered ABOVE the existing per-session bucket.
 * Use case: 30 ops/sec/session is fine for one client, but a tenant with 100
 * clients connected could spam the server with 3000 ops/sec. Per-tenant caps
 * keep one noisy tenant from starving others.
 */
export interface PerTenantBucket {
  /** Returns true if the tenant has capacity, false if rate-limited. */
  take(tenantId: string): boolean
  /** Manual cleanup (tests + graceful shutdown). */
  evictIdle(now?: number): number
  /** Diagnostic. */
  size(): number
}

export function createPerTenantBucket(opts: PerTenantBucketOpts): PerTenantBucket {
  const idleMs = opts.idleEvictMs ?? 5 * 60_000
  const map = new Map<string, Entry>()
  const sweepInterval = setInterval(
    () => {
      const cutoff = Date.now() - idleMs
      for (const [k, e] of map) if (e.lastUsed < cutoff) map.delete(k)
    },
    Math.min(idleMs, 60_000),
  )
  if (typeof sweepInterval.unref === 'function') sweepInterval.unref()

  return {
    take(tenantId: string): boolean {
      let e = map.get(tenantId)
      if (!e) {
        e = {
          bucket: createTokenBucket({
            capacity: opts.capacity,
            refillPerSec: opts.refillPerSec,
          }),
          lastUsed: Date.now(),
        }
        map.set(tenantId, e)
      }
      e.lastUsed = Date.now()
      return e.bucket.take()
    },
    evictIdle(now = Date.now()): number {
      const cutoff = now - idleMs
      let n = 0
      for (const [k, e] of map) {
        if (e.lastUsed < cutoff) {
          map.delete(k)
          n++
        }
      }
      return n
    },
    size(): number {
      return map.size
    },
  }
}
