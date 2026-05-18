// biome-ignore-all lint/suspicious/useIterableCallbackReturn: test predicate intentionally returns non-boolean for assertion clarity.
import { describe, expect, it } from 'vitest'
import { createWorkbookService } from '../../src/services/workbook-service'

function stubDb() {
  const rows: Record<string, unknown>[] = []
  return {
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        returning: async () => {
          const row = { id: `wb_${rows.length + 1}`, isDeleted: false, ...v }
          rows.push(row)
          return [row]
        },
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => rows.filter((r) => !(r as { isDeleted: boolean }).isDeleted),
        }),
      }),
    }),
    update: () => ({
      set: (s: object) => ({
        where: async () => {
          rows.forEach((r) => Object.assign(r, s))
        },
      }),
    }),
    _rows: rows,
  }
}

describe('WorkbookService', () => {
  it('creates a workbook owned by the requesting user', async () => {
    const db = stubDb()
    const svc = createWorkbookService(db as never)
    const wb = await svc.create({ tenantId: 't1', userId: 'u1', name: 'Q1 Grades' })
    expect(wb).toMatchObject({ name: 'Q1 Grades', ownerId: 'u1', tenantId: 't1' })
  })

  it('soft-deletes', async () => {
    const db = stubDb()
    const svc = createWorkbookService(db as never)
    const wb = await svc.create({ tenantId: 't1', userId: 'u1', name: 'x' })
    await svc.softDelete({ tenantId: 't1', id: wb.id })
    expect((db._rows[0] as { isDeleted: boolean }).isDeleted).toBe(true)
  })
})
