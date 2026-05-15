import type { Redis } from '../redis/client'

export interface AcquireInput { workbookId: string; region: string; userId: string }
export interface AcquireResult { acquired: boolean; ownerId: string; ttlSec: number }

const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else
  return 0
end
`.trim()

const RENEW_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('EXPIRE', KEYS[1], ARGV[2])
else
  return 0
end
`.trim()

function lockKey(workbookId: string, region: string): string {
  return `ensemble:lock:${workbookId}:${region}`
}

export function createCellLockManager(opts: { redis: Redis; ttlSec: number }) {
  const { redis, ttlSec } = opts
  return {
    async acquire(input: AcquireInput): Promise<AcquireResult> {
      const key = lockKey(input.workbookId, input.region)
      const result = await redis.set(key, input.userId, 'EX', ttlSec, 'NX')
      if (result === 'OK') return { acquired: true, ownerId: input.userId, ttlSec }
      const ownerId = (await redis.get(key)) ?? ''
      if (ownerId === input.userId) {
        await redis.expire(key, ttlSec)
        return { acquired: true, ownerId, ttlSec }
      }
      return { acquired: false, ownerId, ttlSec }
    },
    async release(input: AcquireInput): Promise<boolean> {
      const result = (await redis.eval(RELEASE_SCRIPT, 1, lockKey(input.workbookId, input.region), input.userId)) as number
      return result === 1
    },
    async renew(input: AcquireInput): Promise<boolean> {
      const result = (await redis.eval(RENEW_SCRIPT, 1, lockKey(input.workbookId, input.region), input.userId, String(ttlSec))) as number
      return result === 1
    },
    async ownerOf(input: { workbookId: string; region: string }): Promise<string | null> {
      return redis.get(lockKey(input.workbookId, input.region))
    },
  }
}

export type CellLockManager = ReturnType<typeof createCellLockManager>
