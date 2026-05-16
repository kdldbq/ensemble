import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTokenBucket } from '../../src/realtime/backpressure'

describe('createTokenBucket', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows up to capacity (30) ops then denies', () => {
    vi.useFakeTimers()
    const bucket = createTokenBucket({ capacity: 30, refillPerSec: 30 })

    // First 30 takes should succeed
    for (let i = 0; i < 30; i++) {
      expect(bucket.take(), `take #${i + 1} should succeed`).toBe(true)
    }
    // 31st should be denied
    expect(bucket.take()).toBe(false)
  })

  it('refills at refillPerSec rate after 1 second', () => {
    vi.useFakeTimers()
    const bucket = createTokenBucket({ capacity: 30, refillPerSec: 30 })

    // Drain completely
    for (let i = 0; i < 30; i++) bucket.take()
    expect(bucket.take()).toBe(false)

    // Advance 1 second — should refill 30 tokens
    vi.advanceTimersByTime(1000)

    // First 30 takes should succeed again
    for (let i = 0; i < 30; i++) {
      expect(bucket.take(), `take #${i + 1} after refill should succeed`).toBe(true)
    }
    expect(bucket.take()).toBe(false)
  })

  it('caps refill at capacity even after 60 seconds', () => {
    vi.useFakeTimers()
    const bucket = createTokenBucket({ capacity: 30, refillPerSec: 30 })

    // Drain completely
    for (let i = 0; i < 30; i++) bucket.take()
    expect(bucket.take()).toBe(false)

    // Advance 60 seconds — would be 1800 tokens without cap
    vi.advanceTimersByTime(60_000)

    // Should only be able to take 30 (capacity), not 1800
    for (let i = 0; i < 30; i++) {
      expect(bucket.take(), `take #${i + 1} after 60s should succeed`).toBe(true)
    }
    expect(bucket.take()).toBe(false)
  })
})
