import { describe, expect, it, vi } from 'vitest'
import { createCollabRoom, createRoomRegistry } from '../../src/realtime/collab-room'

describe('CollabRoom', () => {
  it('addClient + listClients returns members in insertion order', () => {
    const room = createCollabRoom({ workbookId: 'wb' })
    room.addClient({ clientId: 'cA', userId: 'u1', send: vi.fn() })
    room.addClient({ clientId: 'cB', userId: 'u2', send: vi.fn() })
    expect(room.listClients().map((c) => c.userId)).toEqual(['u1', 'u2'])
  })

  it('removeClient drops only that client', () => {
    const room = createCollabRoom({ workbookId: 'wb' })
    room.addClient({ clientId: 'cA', userId: 'u1', send: vi.fn() })
    room.addClient({ clientId: 'cB', userId: 'u2', send: vi.fn() })
    room.removeClient('cA')
    expect(room.listClients().map((c) => c.clientId)).toEqual(['cB'])
  })

  it('broadcast invokes send on every client', () => {
    const room = createCollabRoom({ workbookId: 'wb' })
    const a = vi.fn(); const b = vi.fn()
    room.addClient({ clientId: 'cA', userId: 'u1', send: a })
    room.addClient({ clientId: 'cB', userId: 'u2', send: b })
    room.broadcast({ type: 'demo' })
    expect(a).toHaveBeenCalledWith({ type: 'demo' })
    expect(b).toHaveBeenCalledWith({ type: 'demo' })
  })

  it('broadcastExcept skips excluded client', () => {
    const room = createCollabRoom({ workbookId: 'wb' })
    const a = vi.fn(); const b = vi.fn()
    room.addClient({ clientId: 'cA', userId: 'u1', send: a })
    room.addClient({ clientId: 'cB', userId: 'u2', send: b })
    room.broadcastExcept('cA', { type: 'demo' })
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledWith({ type: 'demo' })
  })
})

describe('createRoomRegistry', () => {
  it('getOrCreate returns same room for same workbookId', () => {
    const reg = createRoomRegistry()
    const r1 = reg.getOrCreate('wb')
    const r2 = reg.getOrCreate('wb')
    expect(r1).toBe(r2)
  })
})
