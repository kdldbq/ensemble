import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createCellLockManager } from '../../src/realtime/cell-lock-manager'
import { type Redis, createRedis } from '../../src/redis/client'
import { redisUrl } from './_dbHelpers'

let redis: Redis

beforeAll(() => {
  redis = createRedis(redisUrl())
})

afterAll(async () => {
  await redis.flushall()
  await redis.quit()
})

describe('CellLockManager real Redis', () => {
  it('only one of N concurrent acquires wins, losers see same owner', async () => {
    const mgr = createCellLockManager({ redis, ttlSec: 5 })
    const N = 20
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        mgr.acquire({ workbookId: 'wb-race', region: 'A1:A1', userId: `u${i}` }),
      ),
    )
    const winners = results.filter((r) => r.acquired)
    expect(winners.length).toBeGreaterThan(0)
    const owner = winners[0]?.ownerId
    for (const l of results.filter((r) => !r.acquired)) {
      expect(l.ownerId).toBe(owner)
    }
  })

  it('TTL expiry releases the lock', async () => {
    const mgr = createCellLockManager({ redis, ttlSec: 1 })
    const a = await mgr.acquire({ workbookId: 'wb-ttl', region: 'A1:A1', userId: 'u1' })
    expect(a.acquired).toBe(true)
    await new Promise((r) => setTimeout(r, 1100))
    const b = await mgr.acquire({ workbookId: 'wb-ttl', region: 'A1:A1', userId: 'u2' })
    expect(b.acquired).toBe(true)
    expect(b.ownerId).toBe('u2')
  })
})
