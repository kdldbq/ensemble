import { describe, expect, it } from 'vitest'
import { folders, shareGrants, tenants, workbooks } from '../../src/db/schema'
import { createGrantRepository } from '../../src/services/grant-repository'
import { resolveCapability } from '../../src/services/grant-service'
import { db } from './_dbHelpers'

describe('grant resolution', () => {
  it('cascades a folder-level edit grant to a child workbook', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'grants-1' }).returning()
    const [root] = await db
      .insert(folders)
      .values({
        tenantId: tenant.id,
        parentId: null,
        name: 'shared-root',
        ownerId: 'owner',
        spaceType: 'shared',
      })
      .returning()
    const [child] = await db
      .insert(folders)
      .values({
        tenantId: tenant.id,
        parentId: root.id,
        name: 'child',
        ownerId: 'owner',
        spaceType: 'shared',
      })
      .returning()
    const [wb] = await db
      .insert(workbooks)
      .values({
        tenantId: tenant.id,
        folderId: child.id,
        name: 'inherited',
        ownerId: 'owner',
      })
      .returning()
    await db.insert(shareGrants).values({
      tenantId: tenant.id,
      resourceType: 'folder',
      resourceId: root.id,
      granteeType: 'user',
      granteeId: 'guest',
      permission: 'edit',
      grantedBy: 'owner',
    })

    const repo = createGrantRepository(db)
    const cap = await resolveCapability({
      identity: { tenantId: tenant.id, userId: 'guest' },
      resource: { type: 'workbook', id: wb.id, tenantId: tenant.id },
      workbookOwnerId: wb.ownerId,
      workbookFolderId: child.id,
      folderAncestors: () => repo.folderAncestors(child.id),
      findGrants: (refs) => repo.findGrants(refs),
    })
    expect(cap).toMatchObject({
      canView: true,
      canEdit: true,
      canShare: false,
      canDelete: false,
    })
  })
})
