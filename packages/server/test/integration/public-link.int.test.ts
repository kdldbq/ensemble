import { describe, expect, it } from 'vitest'
import { db } from './_dbHelpers'
import { shareGrants, tenants, workbooks } from '../../src/db/schema'
import { createGrantRepository } from '../../src/services/grant-repository'
import { resolveCapability } from '../../src/services/grant-service'

describe('public_link grants', () => {
  it('grants view only when token matches', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'pl' }).returning()
    const [wb] = await db.insert(workbooks).values({
      tenantId: tenant.id, name: 'public', ownerId: 'owner',
    }).returning()
    const token = 'secret-link-token-' + crypto.randomUUID()
    await db.insert(shareGrants).values({
      tenantId: tenant.id, resourceType: 'workbook', resourceId: wb.id,
      granteeType: 'public_link', granteeId: token, permission: 'view', grantedBy: 'owner',
    })

    const repo = createGrantRepository(db)
    const ctxBase = {
      identity: { tenantId: tenant.id, userId: 'anonymous' },
      resource: { type: 'workbook' as const, id: wb.id, tenantId: tenant.id },
      workbookOwnerId: 'owner',
      workbookFolderId: null as string | null,
      folderAncestors: async () => [],
      findGrants: (refs: Parameters<ReturnType<typeof createGrantRepository>['findGrants']>[0]) =>
        repo.findGrants(refs),
    }

    const ok = await resolveCapability({ ...ctxBase, publicLinkToken: token })
    expect(ok.canView).toBe(true)
    const denied = await resolveCapability(ctxBase)
    expect(denied.canView).toBe(false)
    const wrong = await resolveCapability({ ...ctxBase, publicLinkToken: 'wrong' })
    expect(wrong.canView).toBe(false)
  })
})
