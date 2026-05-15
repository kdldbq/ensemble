import { Redis } from 'ioredis'
import type { RedisOptions } from 'ioredis'

export function createRedis(url: string, opts: RedisOptions = {}): Redis {
  return new Redis(url, {
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    ...opts,
  })
}

export type { Redis } from 'ioredis'
