import { describe, expect, it } from 'vitest'
import { createVersionService } from '../../src/services/version-service'

function fakeDb() {
  const rows: Record<string, unknown>[] = []
  let n = 1
  return {
    _rows: rows,
    select() {
      return {
        from: () => ({
          where: () => ({
            orderBy: async () => rows.filter((r) => (r as { reason: string }).reason === 'named'),
            limit: async () => rows.slice(0, 1),
          }),
        }),
      }
    },
    insert() {
      return {
        values: (v: Record<string, unknown>) => ({
          returning: async () => {
            const row = { id: 'snap_' + n++, ...v }
            rows.push(row)
            return [row]
          },
        }),
      }
    },
    update() {
      return { set: () => ({ where: async () => undefined }) }
    },
  }
}

describe('VersionService.listNamed', () => {
  it('returns only reason=named', async () => {
    const db = fakeDb()
    db._rows.push(
      { id: 'a', reason: 'auto', name: null, workbookId: 'wb', createdBy: 'u', createdAt: new Date() },
      { id: 'b', reason: 'named', name: 'V1', workbookId: 'wb', createdBy: 'u', createdAt: new Date() },
    )
    const svc = createVersionService(db as never, {} as never)
    const list = await svc.listNamed('wb')
    expect(list.map((s) => s.id)).toEqual(['b'])
  })
})
