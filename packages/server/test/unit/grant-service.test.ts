import { describe, expect, it } from 'vitest'
import { resolveCapability, type GrantContext } from '../../src/services/grant-service'

function ctx(overrides: Partial<GrantContext> = {}): GrantContext {
  return {
    identity: { tenantId: 't1', userId: 'u1' },
    resource: { type: 'workbook', id: 'wb1', tenantId: 't1' },
    workbookOwnerId: 'someone-else',
    workbookFolderId: null,
    folderAncestors: async () => [],
    findGrants: async () => [],
    ...overrides,
  }
}

describe('resolveCapability', () => {
  it('owner always has full capability', async () => {
    const c = await resolveCapability(ctx({ workbookOwnerId: 'u1' }))
    expect(c).toEqual({ canView: true, canEdit: true, canShare: true, canDelete: true })
  })

  it('user grant view → only canView', async () => {
    const c = await resolveCapability(
      ctx({
        findGrants: async () => [{
          resourceType: 'workbook', resourceId: 'wb1',
          granteeType: 'user', granteeId: 'u1',
          permission: 'view', expiresAt: null,
        }],
      })
    )
    expect(c).toEqual({ canView: true, canEdit: false, canShare: false, canDelete: false })
  })

  it('user grant edit → canView + canEdit', async () => {
    const c = await resolveCapability(
      ctx({
        findGrants: async () => [{
          resourceType: 'workbook', resourceId: 'wb1',
          granteeType: 'user', granteeId: 'u1',
          permission: 'edit', expiresAt: null,
        }],
      })
    )
    expect(c).toEqual({ canView: true, canEdit: true, canShare: false, canDelete: false })
  })

  it('tenant_member grant applies to anyone in tenant', async () => {
    const c = await resolveCapability(
      ctx({
        findGrants: async () => [{
          resourceType: 'workbook', resourceId: 'wb1',
          granteeType: 'tenant_member', granteeId: null,
          permission: 'view', expiresAt: null,
        }],
      })
    )
    expect(c.canView).toBe(true)
  })

  it('expired grant is ignored', async () => {
    const c = await resolveCapability(
      ctx({
        findGrants: async () => [{
          resourceType: 'workbook', resourceId: 'wb1',
          granteeType: 'user', granteeId: 'u1',
          permission: 'edit', expiresAt: new Date(Date.now() - 1000),
        }],
      })
    )
    expect(c).toEqual({ canView: false, canEdit: false, canShare: false, canDelete: false })
  })

  it('ancestor folder grant cascades to workbook', async () => {
    const c = await resolveCapability(
      ctx({
        workbookFolderId: 'folder-leaf',
        folderAncestors: async () => ['folder-leaf', 'folder-middle', 'folder-root'],
        findGrants: async (refs) => {
          if (refs.some((r) => r.resourceId === 'folder-middle')) {
            return [{
              resourceType: 'folder', resourceId: 'folder-middle',
              granteeType: 'user', granteeId: 'u1',
              permission: 'edit', expiresAt: null,
            }]
          }
          return []
        },
      })
    )
    expect(c.canEdit).toBe(true)
  })

  it('manage grant unlocks share + delete', async () => {
    const c = await resolveCapability(
      ctx({
        findGrants: async () => [{
          resourceType: 'workbook', resourceId: 'wb1',
          granteeType: 'user', granteeId: 'u1',
          permission: 'manage', expiresAt: null,
        }],
      })
    )
    expect(c).toEqual({ canView: true, canEdit: true, canShare: true, canDelete: true })
  })
})
