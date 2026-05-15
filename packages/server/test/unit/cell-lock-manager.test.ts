import { describe, expect, it, vi } from 'vitest'
import { createCellLockManager } from '../../src/realtime/cell-lock-manager'

function fakeRedis() {
  const store = new Map<string, { value: string; expiresAt: number }>()
  return {
    set: vi.fn(async (key: string, value: string, ...args: unknown[]) => {
      const ex = (args[1] as number) ?? 30
      const nx = args[2] === 'NX'
      const now = Date.now()
      const cur = store.get(key)
      if (nx && cur && cur.expiresAt > now) return null
      store.set(key, { value, expiresAt: now + ex * 1000 })
      return 'OK'
    }),
    get: vi.fn(async (key: string) => {
      const cur = store.get(key)
      if (!cur || cur.expiresAt < Date.now()) return null
      return cur.value
    }),
    del: vi.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
    expire: vi.fn(async (key: string, ex: number) => {
      const cur = store.get(key)
      if (!cur) return 0
      cur.expiresAt = Date.now() + ex * 1000
      return 1
    }),
    eval: vi.fn(async (script: string, _n: number, key: string, ...args: string[]) => {
      const cur = store.get(key)
      const owner = cur && cur.expiresAt > Date.now() ? cur.value : null
      if (script.includes('DEL')) {
        if (owner === args[0]) { store.delete(key); return 1 }
        return 0
      }
      if (script.includes('EXPIRE')) {
        if (owner === args[0]) {
          cur!.expiresAt = Date.now() + Number(args[1]) * 1000
          return 1
        }
        return 0
      }
      return 0
    }),
    _store: store,
  }
}

describe('CellLockManager', () => {
  it('acquire returns true on first call, false on contention', async () => {
    const mgr = createCellLockManager({ redis: fakeRedis() as never, ttlSec: 30 })
    const a = await mgr.acquire({ workbookId: 'wb', region: 'A1:A1', userId: 'u1' })
    const b = await mgr.acquire({ workbookId: 'wb', region: 'A1:A1', userId: 'u2' })
    expect(a.acquired).toBe(true)
    expect(a.ownerId).toBe('u1')
    expect(b.acquired).toBe(false)
    expect(b.ownerId).toBe('u1')
  })

  it('owner can re-acquire (TTL refresh)', async () => {
    const mgr = createCellLockManager({ redis: fakeRedis() as never, ttlSec: 30 })
    const a = await mgr.acquire({ workbookId: 'wb', region: 'A1:A1', userId: 'u1' })
    const a2 = await mgr.acquire({ workbookId: 'wb', region: 'A1:A1', userId: 'u1' })
    expect(a.acquired).toBe(true)
    expect(a2.acquired).toBe(true)
  })

  it('release deletes lock; non-owner release is no-op', async () => {
    const mgr = createCellLockManager({ redis: fakeRedis() as never, ttlSec: 30 })
    await mgr.acquire({ workbookId: 'wb', region: 'A1:A1', userId: 'u1' })
    expect(await mgr.release({ workbookId: 'wb', region: 'A1:A1', userId: 'attacker' })).toBe(false)
    expect(await mgr.release({ workbookId: 'wb', region: 'A1:A1', userId: 'u1' })).toBe(true)
    const a = await mgr.acquire({ workbookId: 'wb', region: 'A1:A1', userId: 'u2' })
    expect(a.acquired).toBe(true)
  })

  it('renew extends TTL only for owner', async () => {
    const mgr = createCellLockManager({ redis: fakeRedis() as never, ttlSec: 30 })
    await mgr.acquire({ workbookId: 'wb', region: 'A1:A1', userId: 'u1' })
    expect(await mgr.renew({ workbookId: 'wb', region: 'A1:A1', userId: 'u1' })).toBe(true)
    expect(await mgr.renew({ workbookId: 'wb', region: 'A1:A1', userId: 'u2' })).toBe(false)
  })
})
