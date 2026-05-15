import { describe, expect, it, vi } from 'vitest'
import { createSnapshotService } from '../../src/services/snapshot-service'

const fakeStorage = {
  put: vi.fn(async () => {}),
  get: vi.fn(async () => new TextEncoder().encode('{"hello":"world"}')),
  delete: vi.fn(async () => {}),
}

const dbStub = {
  _snapshots: [] as Record<string, unknown>[],
  insert() {
    const self = this
    return {
      values(v: Record<string, unknown>) {
        return {
          async returning() {
            const row = { id: 'snap_' + (self._snapshots.length + 1), ...v }
            self._snapshots.push(row)
            return [row]
          },
        }
      },
    }
  },
  select() { return { from: () => ({ where: () => ({ limit: async () => this._snapshots }) }) } },
}

describe('SnapshotService', () => {
  it('puts blob and inserts row with size', async () => {
    const svc = createSnapshotService(dbStub as never, fakeStorage)
    const body = new TextEncoder().encode('{"a":1}')
    const snap = await svc.create({ tenantId: 't', workbookId: 'wb', userId: 'u', body, reason: 'manual' })
    expect(fakeStorage.put).toHaveBeenCalledTimes(1)
    expect(snap.sizeBytes).toBe(body.byteLength)
    expect(snap.workbookId).toBe('wb')
  })
})
