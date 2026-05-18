import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type SessionHandle,
  type SessionRegistry,
  createSessionRegistry,
} from '../../src/realtime/session-registry'

function handle(overrides: Partial<SessionHandle> = {}): SessionHandle {
  return {
    sessionId: 's1',
    userId: 'u1',
    tenantId: 't1',
    workbookId: 'wb1',
    openedAt: new Date('2026-05-18T00:00:00Z'),
    close: vi.fn(),
    ...overrides,
  }
}

describe('SessionRegistry', () => {
  let reg: SessionRegistry

  beforeEach(() => {
    reg = createSessionRegistry()
  })

  describe('register / unregister / get', () => {
    it('stores and retrieves a handle by sessionId', () => {
      const h = handle({ sessionId: 'abc' })
      reg.register(h)
      expect(reg.get('abc')).toBe(h)
    })

    it('unregister removes the handle', () => {
      reg.register(handle({ sessionId: 'abc' }))
      reg.unregister('abc')
      expect(reg.get('abc')).toBeUndefined()
    })

    it('register replaces any prior handle with the same sessionId', () => {
      const first = handle({ sessionId: 'abc', userId: 'u1' })
      const second = handle({ sessionId: 'abc', userId: 'u2' })
      reg.register(first)
      reg.register(second)
      expect(reg.get('abc')?.userId).toBe('u2')
    })
  })

  describe('list / forUser / forWorkbook', () => {
    beforeEach(() => {
      reg.register(handle({ sessionId: 's1', userId: 'u1', tenantId: 't1', workbookId: 'wb1' }))
      reg.register(handle({ sessionId: 's2', userId: 'u1', tenantId: 't1', workbookId: 'wb2' }))
      reg.register(handle({ sessionId: 's3', userId: 'u2', tenantId: 't1', workbookId: 'wb1' }))
      reg.register(handle({ sessionId: 's4', userId: 'u3', tenantId: 't2', workbookId: 'wb3' }))
    })

    it('list(tenantId) returns only sessions in that tenant', () => {
      const t1Ids = reg
        .list('t1')
        .map((h) => h.sessionId)
        .sort()
      expect(t1Ids).toEqual(['s1', 's2', 's3'])
      const t2Ids = reg.list('t2').map((h) => h.sessionId)
      expect(t2Ids).toEqual(['s4'])
    })

    it('forUser is tenant-scoped', () => {
      const u1InT1 = reg
        .forUser('u1', 't1')
        .map((h) => h.sessionId)
        .sort()
      expect(u1InT1).toEqual(['s1', 's2'])
      const u1InT2 = reg.forUser('u1', 't2')
      expect(u1InT2).toEqual([])
    })

    it('forWorkbook is tenant-scoped', () => {
      const wb1InT1 = reg
        .forWorkbook('wb1', 't1')
        .map((h) => h.sessionId)
        .sort()
      expect(wb1InT1).toEqual(['s1', 's3'])
      const wb1InT2 = reg.forWorkbook('wb1', 't2')
      expect(wb1InT2).toEqual([])
    })
  })

  describe('kick', () => {
    it('calls handle.close and removes the handle when sessionId matches in-tenant', () => {
      const close = vi.fn()
      reg.register(handle({ sessionId: 's1', tenantId: 't1', close }))
      const result = reg.kick('s1', 't1')
      expect(result).toBe(true)
      expect(close).toHaveBeenCalledTimes(1)
      expect(reg.get('s1')).toBeUndefined()
    })

    it('returns false and does NOT call close when sessionId is unknown', () => {
      expect(reg.kick('missing', 't1')).toBe(false)
    })

    it('refuses to kick a session belonging to a different tenant', () => {
      const close = vi.fn()
      reg.register(handle({ sessionId: 's1', tenantId: 't1', close }))
      const result = reg.kick('s1', 'other-tenant')
      expect(result).toBe(false)
      expect(close).not.toHaveBeenCalled()
      expect(reg.get('s1')).toBeDefined()
    })
  })

  describe('kickForUser', () => {
    it('kicks every session for (userId, tenantId) and returns count', () => {
      const c1 = vi.fn()
      const c2 = vi.fn()
      const c3 = vi.fn()
      reg.register(handle({ sessionId: 's1', userId: 'u1', tenantId: 't1', close: c1 }))
      reg.register(handle({ sessionId: 's2', userId: 'u1', tenantId: 't1', close: c2 }))
      reg.register(handle({ sessionId: 's3', userId: 'u2', tenantId: 't1', close: c3 }))
      const n = reg.kickForUser('u1', 't1')
      expect(n).toBe(2)
      expect(c1).toHaveBeenCalledTimes(1)
      expect(c2).toHaveBeenCalledTimes(1)
      expect(c3).not.toHaveBeenCalled()
      expect(reg.get('s1')).toBeUndefined()
      expect(reg.get('s2')).toBeUndefined()
      expect(reg.get('s3')).toBeDefined()
    })

    it('does not cross tenant boundary', () => {
      const c1 = vi.fn()
      reg.register(handle({ sessionId: 's1', userId: 'u1', tenantId: 't1', close: c1 }))
      const n = reg.kickForUser('u1', 't2')
      expect(n).toBe(0)
      expect(c1).not.toHaveBeenCalled()
    })
  })

  describe('kickForWorkbook', () => {
    it('kicks every session for (workbookId, tenantId)', () => {
      const c1 = vi.fn()
      const c2 = vi.fn()
      reg.register(handle({ sessionId: 's1', workbookId: 'wb1', tenantId: 't1', close: c1 }))
      reg.register(handle({ sessionId: 's2', workbookId: 'wb1', tenantId: 't1', close: c2 }))
      reg.register(handle({ sessionId: 's3', workbookId: 'wb2', tenantId: 't1', close: vi.fn() }))
      const n = reg.kickForWorkbook('wb1', 't1')
      expect(n).toBe(2)
      expect(c1).toHaveBeenCalledTimes(1)
      expect(c2).toHaveBeenCalledTimes(1)
      expect(reg.get('s1')).toBeUndefined()
      expect(reg.get('s2')).toBeUndefined()
      expect(reg.get('s3')).toBeDefined()
    })
  })
})
