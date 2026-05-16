import { describe, expect, it, vi } from 'vitest'
import { createEventEmitter } from '../../src/events/event-emitter'

describe('EventEmitter', () => {
  it('writes audit row and calls adapter.publish in parallel', async () => {
    const inserts: unknown[] = []
    const fakeDb = {
      insert: () => ({
        values: async (v: unknown) => {
          inserts.push(v)
        },
      }),
    }
    const publish = vi.fn(async () => {})
    const emitter = createEventEmitter({ db: fakeDb as never, eventAdapter: { publish } })

    await emitter.emit({
      tenantId: 'tA',
      actorId: 'u1',
      type: 'workbook.created',
      resourceId: 'wb1',
    })
    expect(publish).toHaveBeenCalledTimes(1)
    expect(inserts).toHaveLength(1)
  })

  it('swallows adapter errors but still writes audit', async () => {
    const inserts: unknown[] = []
    const fakeDb = {
      insert: () => ({
        values: async (v: unknown) => {
          inserts.push(v)
        },
      }),
    }
    const adapter = {
      publish: vi.fn(async () => {
        throw new Error('webhook down')
      }),
    }
    const emitter = createEventEmitter({ db: fakeDb as never, eventAdapter: adapter })
    await expect(
      emitter.emit({
        tenantId: 't',
        actorId: 'u',
        type: 'workbook.edited',
        resourceId: 'wb',
        extra: { batchedOpsCount: 5 },
      }),
    ).resolves.toBeUndefined()
    expect(inserts).toHaveLength(1)
  })
})
