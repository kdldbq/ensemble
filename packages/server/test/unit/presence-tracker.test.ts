import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPresenceTracker } from '../../src/realtime/presence-tracker'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('PresenceTracker', () => {
  it('list initially empty', () => {
    const p = createPresenceTracker({ evictAfterMs: 15_000 })
    expect(p.list('wb')).toEqual([])
  })

  it('heartbeat adds entry', () => {
    const p = createPresenceTracker({ evictAfterMs: 15_000 })
    p.heartbeat({ workbookId: 'wb', clientId: 'c1', userId: 'u1' })
    expect(p.list('wb')).toHaveLength(1)
  })

  it('evicts after evictAfterMs without heartbeat', () => {
    const p = createPresenceTracker({ evictAfterMs: 15_000 })
    p.heartbeat({ workbookId: 'wb', clientId: 'c1', userId: 'u1' })
    vi.advanceTimersByTime(15_001)
    expect(p.evictStale('wb')).toEqual(['c1'])
    expect(p.list('wb')).toEqual([])
  })

  it('refresh resets the eviction timer', () => {
    const p = createPresenceTracker({ evictAfterMs: 15_000 })
    p.heartbeat({ workbookId: 'wb', clientId: 'c1', userId: 'u1' })
    vi.advanceTimersByTime(14_000)
    p.heartbeat({ workbookId: 'wb', clientId: 'c1', userId: 'u1' })
    vi.advanceTimersByTime(14_000)
    expect(p.evictStale('wb')).toEqual([])
  })

  it('remove drops specific client immediately', () => {
    const p = createPresenceTracker({ evictAfterMs: 15_000 })
    p.heartbeat({ workbookId: 'wb', clientId: 'c1', userId: 'u1' })
    p.heartbeat({ workbookId: 'wb', clientId: 'c2', userId: 'u2' })
    p.remove('wb', 'c1')
    expect(p.list('wb').map((x) => x.clientId)).toEqual(['c2'])
  })

  it('startSweep invokes onEvict on expired clients', () => {
    const p = createPresenceTracker({ evictAfterMs: 15_000 })
    const onEvict = vi.fn()
    const stop = p.startSweep({ intervalMs: 1000, onEvict })
    p.heartbeat({ workbookId: 'wb', clientId: 'c1', userId: 'u1' })
    vi.advanceTimersByTime(16_000)
    expect(onEvict).toHaveBeenCalledWith('wb', 'c1')
    stop()
  })
})
