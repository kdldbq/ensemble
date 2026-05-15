import { describe, expect, it } from 'vitest'
import { db } from './_dbHelpers'
import { tenants, workbooks } from '../../src/db/schema'
import { createMutationService } from '../../src/services/mutation-service'

describe('MutationService persistence', () => {
  it('assigns monotonic seq_num under concurrent append', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'mut-concur' }).returning()
    const [wb] = await db.insert(workbooks).values({ tenantId: tenant.id, ownerId: 'u', name: 'concur' }).returning()
    const svc = createMutationService({ db })

    const N = 50
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        svc.append({ workbookId: wb.id, userId: `u${i % 3}`, payload: { i } })
      )
    )
    const seqs = results.map((r) => r.seqNum).sort((a, b) => a - b)
    expect(seqs).toEqual(Array.from({ length: N }, (_, i) => i + 1))

    const all = await svc.since(wb.id, 0, 1000)
    expect(all).toHaveLength(N)
  })
})
