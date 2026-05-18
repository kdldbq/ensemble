import { describe, expect, it, vi } from 'vitest'
import { createMaskCachePubSub, INVALIDATE_CHANNEL } from '../../src/realtime/mask-cache-pubsub'

function fakeRedis() {
  const handlers = new Map<string, ((channel: string, msg: string) => void)[]>()
  const self = {
    publish: vi.fn(async (ch: string, msg: string) => {
      const hs = handlers.get(ch) ?? []
      for (const h of hs) h(ch, msg)
      return hs.length
    }),
    subscribe: vi.fn(async (..._channels: string[]) => undefined),
    on: vi.fn((event: string, cb: (ch: string, msg: string) => void) => {
      if (event === 'message') {
        const list = handlers.get(INVALIDATE_CHANNEL) ?? []
        list.push(cb)
        handlers.set(INVALIDATE_CHANNEL, list)
      }
    }),
    unsubscribe: vi.fn(async () => undefined),
    quit: vi.fn(async () => undefined),
    duplicate(): typeof self {
      return self
    },
  }
  return self
}

describe('MaskCachePubSub', () => {
  it('publish + subscribe broadcasts invalidate', async () => {
    const redis = fakeRedis()
    const onInvalidate = vi.fn()
    const pubsub = createMaskCachePubSub({ redis: redis as never, onInvalidate })
    await pubsub.start()
    await pubsub.invalidate('u1', 'wb1')
    expect(onInvalidate).toHaveBeenCalledWith('u1', 'wb1')
  })
})
