import { describe, expect, it } from 'vitest'
import { createRedis } from '../../src/redis/client'
import { redisUrl } from './_dbHelpers'

describe('Redis smoke', () => {
  it('SET + GET round-trip', async () => {
    const redis = createRedis(redisUrl())
    await redis.set('hello', 'world')
    expect(await redis.get('hello')).toBe('world')
    await redis.quit()
  })

  it('SET NX EX returns OK once, null on contention', async () => {
    const redis = createRedis(redisUrl())
    const a = await redis.set('lock:k', 'A', 'EX', 5, 'NX')
    const b = await redis.set('lock:k', 'B', 'EX', 5, 'NX')
    expect(a).toBe('OK')
    expect(b).toBeNull()
    await redis.quit()
  })
})
