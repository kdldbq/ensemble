import { describe, expect, it } from 'vitest'
import { type GrantContext, resolveCapability } from '../../src/services/grant-service'

function ctx(overrides: Partial<GrantContext> = {}): GrantContext {
  return {
    identity: { tenantId: 't1', userId: 'u1' },
    resource: { type: 'workbook', id: 'wb1', tenantId: 't1' },
    workbookOwnerId: 'someone-else',
    workbookTenantId: 't1',
    workbookFolderId: null,
    folderAncestors: async () => [],
    findGrants: async () => [],
    ...overrides,
  }
}

describe('resolveCapability', () => {
  it('owner always has full capability', async () => {
    const c = await resolveCapability(ctx({ workbookOwnerId: 'u1' }))
    expect(c).toMatchObject({
      canView: true,
      canEdit: true,
      canShare: true,
      canDelete: true,
    })
  })

  it('user grant view → only canView', async () => {
    const c = await resolveCapability(
      ctx({
        findGrants: async () => [
          {
            resourceType: 'workbook',
            resourceId: 'wb1',
            granteeType: 'user',
            granteeId: 'u1',
            permission: 'view',
            expiresAt: null,
          },
        ],
      }),
    )
    expect(c).toMatchObject({
      canView: true,
      canEdit: false,
      canShare: false,
      canDelete: false,
    })
  })

  it('user grant edit → canView + canEdit', async () => {
    const c = await resolveCapability(
      ctx({
        findGrants: async () => [
          {
            resourceType: 'workbook',
            resourceId: 'wb1',
            granteeType: 'user',
            granteeId: 'u1',
            permission: 'edit',
            expiresAt: null,
          },
        ],
      }),
    )
    expect(c).toMatchObject({
      canView: true,
      canEdit: true,
      canShare: false,
      canDelete: false,
    })
  })

  it('tenant_member grant applies to anyone in tenant', async () => {
    const c = await resolveCapability(
      ctx({
        findGrants: async () => [
          {
            resourceType: 'workbook',
            resourceId: 'wb1',
            granteeType: 'tenant_member',
            granteeId: null,
            permission: 'view',
            expiresAt: null,
          },
        ],
      }),
    )
    expect(c.canView).toBe(true)
  })

  it('expired grant is ignored', async () => {
    const c = await resolveCapability(
      ctx({
        findGrants: async () => [
          {
            resourceType: 'workbook',
            resourceId: 'wb1',
            granteeType: 'user',
            granteeId: 'u1',
            permission: 'edit',
            expiresAt: new Date(Date.now() - 1000),
          },
        ],
      }),
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
            return [
              {
                resourceType: 'folder',
                resourceId: 'folder-middle',
                granteeType: 'user',
                granteeId: 'u1',
                permission: 'edit',
                expiresAt: null,
              },
            ]
          }
          return []
        },
      }),
    )
    expect(c.canEdit).toBe(true)
  })

  it('manage grant unlocks share + delete', async () => {
    const c = await resolveCapability(
      ctx({
        findGrants: async () => [
          {
            resourceType: 'workbook',
            resourceId: 'wb1',
            granteeType: 'user',
            granteeId: 'u1',
            permission: 'manage',
            expiresAt: null,
          },
        ],
      }),
    )
    expect(c).toMatchObject({
      canView: true,
      canEdit: true,
      canShare: true,
      canDelete: true,
    })
  })

  describe('public_link grants (HMAC + dual-path)', () => {
    const SECRET = 'x'.repeat(64)
    const computeHmac = (token: string): string => {
      const { hmacLinkToken } = require('../../src/services/link-token') as {
        hmacLinkToken: (s: string, t: string) => string
      }
      return hmacLinkToken(SECRET, token)
    }

    it('HMAC path: applies grant when presented token hashes to stored hmac', async () => {
      const token = 'caller-presented-token'
      const c = await resolveCapability(
        ctx({
          identity: { tenantId: 't1', userId: 'anon' },
          publicLinkToken: token,
          linkHmacSecret: SECRET,
          findGrants: async () => [
            {
              resourceType: 'workbook',
              resourceId: 'wb1',
              granteeType: 'public_link',
              granteeId: null,
              linkTokenHmac: computeHmac(token),
              permission: 'view',
              expiresAt: null,
            },
          ],
        }),
      )
      expect(c.canView).toBe(true)
    })

    it('HMAC path: rejects when presented token does not match stored hmac', async () => {
      const c = await resolveCapability(
        ctx({
          identity: { tenantId: 't1', userId: 'anon' },
          publicLinkToken: 'wrong-token',
          linkHmacSecret: SECRET,
          findGrants: async () => [
            {
              resourceType: 'workbook',
              resourceId: 'wb1',
              granteeType: 'public_link',
              granteeId: null,
              linkTokenHmac: computeHmac('right-token'),
              permission: 'view',
              expiresAt: null,
            },
          ],
        }),
      )
      expect(c.canView).toBe(false)
    })

    it('HMAC path: no secret in context → grant ignored even with correct token', async () => {
      const token = 'real-token'
      const c = await resolveCapability(
        ctx({
          identity: { tenantId: 't1', userId: 'anon' },
          publicLinkToken: token,
          findGrants: async () => [
            {
              resourceType: 'workbook',
              resourceId: 'wb1',
              granteeType: 'public_link',
              granteeId: null,
              linkTokenHmac: computeHmac(token),
              permission: 'view',
              expiresAt: null,
            },
          ],
        }),
      )
      expect(c.canView).toBe(false)
    })

    it('dual-path: legacy grant (hmac null, granteeId set) still verifies cleartext', async () => {
      const token = 'legacy-cleartext-token'
      const c = await resolveCapability(
        ctx({
          identity: { tenantId: 't1', userId: 'anon' },
          publicLinkToken: token,
          linkHmacSecret: SECRET,
          findGrants: async () => [
            {
              resourceType: 'workbook',
              resourceId: 'wb1',
              granteeType: 'public_link',
              granteeId: token,
              linkTokenHmac: null,
              permission: 'view',
              expiresAt: null,
            },
          ],
        }),
      )
      expect(c.canView).toBe(true)
    })

    it('hmac precedence: cleartext mismatch but hmac match still applies', async () => {
      const token = 'real-token'
      const c = await resolveCapability(
        ctx({
          identity: { tenantId: 't1', userId: 'anon' },
          publicLinkToken: token,
          linkHmacSecret: SECRET,
          findGrants: async () => [
            {
              resourceType: 'workbook',
              resourceId: 'wb1',
              granteeType: 'public_link',
              granteeId: 'unrelated-sentinel',
              linkTokenHmac: computeHmac(token),
              permission: 'view',
              expiresAt: null,
            },
          ],
        }),
      )
      expect(c.canView).toBe(true)
    })
  })
})
