/**
 * TokenBucket — 30 ops/sec per-client backpressure (T15).
 * createTokenBucket() implements a leaky-bucket refill: tokens accumulate
 * at refillPerSec per second up to capacity; each take() consumes one token.
 */

export interface BucketOpts {
  capacity: number
  refillPerSec: number
}

export interface TokenBucket {
  take(): boolean
}

export function createTokenBucket(opts: BucketOpts): TokenBucket {
  let tokens = opts.capacity
  let lastRefill = Date.now()
  return {
    take(): boolean {
      const now = Date.now()
      const elapsedSec = (now - lastRefill) / 1000
      tokens = Math.min(opts.capacity, tokens + elapsedSec * opts.refillPerSec)
      lastRefill = now
      if (tokens >= 1) {
        tokens -= 1
        return true
      }
      return false
    },
  }
}
