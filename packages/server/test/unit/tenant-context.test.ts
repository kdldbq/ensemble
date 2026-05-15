import { describe, expect, it, vi } from 'vitest'
import { withTenant } from '../../src/db/tenant-context'

describe('withTenant', () => {
  it('sets app.tenant_id at the transaction start', async () => {
    const calls: string[] = []
    const fakeTx = {
      execute: vi.fn(async (q: unknown) => {
        calls.push(String(q))
      }),
    }
    const fakeDb = {
      transaction: async (fn: (tx: typeof fakeTx) => Promise<unknown>) => fn(fakeTx),
    }
    const result = await withTenant(fakeDb as never, '11111111-1111-1111-1111-111111111111', async (tx) => {
      await tx.execute('SELECT 1')
      return 'ok'
    })
    expect(result).toBe('ok')
    expect(calls[0]).toMatch(/set_config/i)
    expect(calls[1]).toBe('SELECT 1')
  })

  it('rejects empty / non-uuid tenant ids', async () => {
    const fakeDb = { transaction: vi.fn() }
    await expect(withTenant(fakeDb as never, '', async () => 1)).rejects.toThrow(/tenant/i)
    await expect(withTenant(fakeDb as never, 'not-a-uuid', async () => 1)).rejects.toThrow(/uuid/i)
  })
})
