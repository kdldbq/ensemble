import type { Redis } from '../redis/client'

export const INVALIDATE_CHANNEL = 'ensemble:mask-invalidate'

export interface MaskCachePubSubOpts {
  redis: Redis
  onInvalidate: (userId: string, workbookId: string) => void
}

export function createMaskCachePubSub(opts: MaskCachePubSubOpts) {
  const sub = opts.redis.duplicate()
  let started = false
  return {
    async start(): Promise<void> {
      if (started) return
      await sub.subscribe(INVALIDATE_CHANNEL)
      sub.on('message', (channel: string, msg: string) => {
        if (channel !== INVALIDATE_CHANNEL) return
        try {
          const { userId, workbookId } = JSON.parse(msg) as { userId: string; workbookId: string }
          opts.onInvalidate(userId, workbookId)
        } catch {
          /* malformed */
        }
      })
      started = true
    },
    async invalidate(userId: string, workbookId: string): Promise<void> {
      await opts.redis.publish(INVALIDATE_CHANNEL, JSON.stringify({ userId, workbookId }))
    },
    async stop(): Promise<void> {
      if (!started) return
      await sub.unsubscribe(INVALIDATE_CHANNEL)
      await sub.quit()
      started = false
    },
  }
}

export type MaskCachePubSub = ReturnType<typeof createMaskCachePubSub>
