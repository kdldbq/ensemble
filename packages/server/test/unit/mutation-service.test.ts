import { describe, expect, it, vi } from 'vitest'
import { createMutationService } from '../../src/services/mutation-service'

function fakeTx(initialMax: number | null = null) {
  let max = initialMax
  const inserted: { workbookId: string; seqNum: number; payload: unknown; userId: string }[] = []
  return {
    execute: vi.fn(async (_q: unknown) => [{ max_seq: max }]),
    insert: () => ({
      values: async (v: typeof inserted[number]) => {
        inserted.push(v)
        max = v.seqNum
      },
    }),
    _inserted: inserted,
  }
}

describe('MutationService.append', () => {
  it('seq_num starts at 1 for empty workbook', async () => {
    const tx = fakeTx(null)
    const svc = createMutationService({ db: { transaction: async (fn: (tx: unknown) => unknown) => fn(tx) } } as never)
    const r = await svc.append({ workbookId: 'wb', userId: 'u', payload: { op: 'set' } })
    expect(r.seqNum).toBe(1)
  })

  it('increments past existing max', async () => {
    const tx = fakeTx(42)
    const svc = createMutationService({ db: { transaction: async (fn: (tx: unknown) => unknown) => fn(tx) } } as never)
    const r = await svc.append({ workbookId: 'wb', userId: 'u', payload: {} })
    expect(r.seqNum).toBe(43)
  })
})
