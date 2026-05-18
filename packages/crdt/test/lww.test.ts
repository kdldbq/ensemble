import { describe, expect, it } from 'vitest'
import { InMemoryLwwCrdtAdapter } from '../src/index'

describe('LWW CRDT', () => {
  it('local write is readable', () => {
    const a = new InMemoryLwwCrdtAdapter('A')
    a.localWrite({ sheet: 's1', row: 0, col: 0 }, 'hello')
    expect(a.read({ sheet: 's1', row: 0, col: 0 })).toBe('hello')
  })

  it('higher lamport wins', () => {
    const a = new InMemoryLwwCrdtAdapter('A')
    const op1 = a.localWrite({ sheet: 's', row: 0, col: 0 }, 'first')
    const op2 = a.localWrite({ sheet: 's', row: 0, col: 0 }, 'second')
    expect(op2.lamport).toBeGreaterThan(op1.lamport)
    expect(a.read({ sheet: 's', row: 0, col: 0 })).toBe('second')
  })

  it('replica tie-breaks at equal lamport (B > A)', () => {
    const a = new InMemoryLwwCrdtAdapter('A')
    const b = new InMemoryLwwCrdtAdapter('B')
    const addr = { sheet: 's', row: 0, col: 0 }
    a.applyOp({ addr, lamport: 5, replica: 'A', value: 'fromA' })
    a.applyOp({ addr, lamport: 5, replica: 'B', value: 'fromB' })
    b.applyOp({ addr, lamport: 5, replica: 'A', value: 'fromA' })
    b.applyOp({ addr, lamport: 5, replica: 'B', value: 'fromB' })
    expect(a.read(addr)).toBe('fromB')
    expect(b.read(addr)).toBe('fromB')
  })

  it('out-of-order delivery still converges', () => {
    const a = new InMemoryLwwCrdtAdapter('A')
    const b = new InMemoryLwwCrdtAdapter('B')
    const addr = { sheet: 's', row: 0, col: 0 }
    const op1 = a.localWrite(addr, 'v1')
    const op2 = a.localWrite(addr, 'v2')
    b.applyOp(op2)
    b.applyOp(op1)
    expect(b.read(addr)).toBe('v2')
  })

  it('diff + merge syncs two replicas', () => {
    const a = new InMemoryLwwCrdtAdapter('A')
    const b = new InMemoryLwwCrdtAdapter('B')
    a.localWrite({ sheet: 's', row: 0, col: 0 }, 'x')
    a.localWrite({ sheet: 's', row: 1, col: 0 }, 'y')
    const diff = a.diff(null)
    b.merge(diff)
    expect(b.read({ sheet: 's', row: 0, col: 0 })).toBe('x')
    expect(b.read({ sheet: 's', row: 1, col: 0 })).toBe('y')
  })

  it('snapshot round-trips', () => {
    const a = new InMemoryLwwCrdtAdapter('A')
    a.localWrite({ sheet: 's', row: 0, col: 0 }, 'persist')
    const snap = a.snapshot()
    const b = new InMemoryLwwCrdtAdapter('B')
    b.load(snap)
    expect(b.read({ sheet: 's', row: 0, col: 0 })).toBe('persist')
  })

  it('null = delete', () => {
    const a = new InMemoryLwwCrdtAdapter('A')
    a.localWrite({ sheet: 's', row: 0, col: 0 }, 'will-go')
    a.localWrite({ sheet: 's', row: 0, col: 0 }, null)
    expect(a.read({ sheet: 's', row: 0, col: 0 })).toBeNull()
  })
})
