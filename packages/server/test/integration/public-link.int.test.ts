import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  type IdentityAdapter,
  NoopEventAdapter,
  type PermissionAdapter,
} from '../../src/adapters/identity'
import { shareGrants, tenants, workbooks } from '../../src/db/schema'
import { buildApp } from '../../src/http/app'
import { createGrantRepository } from '../../src/services/grant-repository'
import { resolveCapability } from '../../src/services/grant-service'
import { hmacLinkToken } from '../../src/services/link-token'
import { db } from './_dbHelpers'

const SECRET = 'z'.repeat(64)

describe('public_link grants', () => {
  it('grants view only when token matches (legacy cleartext rows — dual-path)', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'pl-legacy' }).returning()
    const [wb] = await db
      .insert(workbooks)
      .values({
        tenantId: tenant.id,
        name: 'public',
        ownerId: 'owner',
      })
      .returning()
    const token = `secret-link-token-${crypto.randomUUID()}`
    await db.insert(shareGrants).values({
      tenantId: tenant.id,
      resourceType: 'workbook',
      resourceId: wb.id,
      granteeType: 'public_link',
      granteeId: token,
      permission: 'view',
      grantedBy: 'owner',
    })

    const repo = createGrantRepository(db)
    const ctxBase = {
      identity: { tenantId: tenant.id, userId: 'anonymous' },
      resource: { type: 'workbook' as const, id: wb.id, tenantId: tenant.id },
      workbookOwnerId: 'owner',
      workbookTenantId: tenant.id,
      workbookFolderId: null as string | null,
      folderAncestors: async () => [],
      findGrants: (refs: Parameters<ReturnType<typeof createGrantRepository>['findGrants']>[0]) =>
        repo.findGrants(refs),
      linkHmacSecret: SECRET,
    }

    const ok = await resolveCapability({ ...ctxBase, publicLinkToken: token })
    expect(ok.canView).toBe(true)
    const denied = await resolveCapability(ctxBase)
    expect(denied.canView).toBe(false)
    const wrong = await resolveCapability({ ...ctxBase, publicLinkToken: 'wrong' })
    expect(wrong.canView).toBe(false)
  })

  it('POST stores HMAC and returns cleartext linkToken exactly once', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'pl-hmac' }).returning()
    const [wb] = await db
      .insert(workbooks)
      .values({ tenantId: tenant.id, name: 'public', ownerId: 'owner' })
      .returning()

    const identity: IdentityAdapter = {
      resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'owner' }),
    }
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({
        canView: true,
        canEdit: true,
        canShare: true,
        canDelete: true,
      }),
      getMaskRules: async () => [],
    }
    const app = buildApp({
      db,
      identity,
      permission,
      storage: { put: async () => {}, get: async () => new Uint8Array(), delete: async () => {} },
      event: new NoopEventAdapter(),
      linkHmacSecret: SECRET,
    })

    const post = await app.request('/api/v1/grants', {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: JSON.stringify({
        resourceType: 'workbook',
        resourceId: wb.id,
        granteeType: 'public_link',
        permission: 'view',
      }),
    })
    expect(post.status).toBe(201)
    const json = (await post.json()) as { id: string; linkToken: string; granteeId: string | null }
    expect(json.linkToken).toBeTruthy()
    expect(json.linkToken.length).toBeGreaterThanOrEqual(43)

    const [grantRow] = await db
      .select()
      .from(shareGrants)
      .where(eq(shareGrants.id, json.id))
      .limit(1)
    if (!grantRow) throw new Error('grant row not found')
    expect(grantRow.linkTokenHmac).toBe(hmacLinkToken(SECRET, json.linkToken))
    // cleartext token must NOT be stored anywhere on the row
    expect(grantRow.granteeId).not.toBe(json.linkToken)
  })

  it('resolveCapability matches via HMAC for newly created grants (HMAC path)', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'pl-verify' }).returning()
    const [wb] = await db
      .insert(workbooks)
      .values({ tenantId: tenant.id, name: 'public', ownerId: 'owner' })
      .returning()

    const identity: IdentityAdapter = {
      resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'owner' }),
    }
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({
        canView: true,
        canEdit: true,
        canShare: true,
        canDelete: true,
      }),
      getMaskRules: async () => [],
    }
    const app = buildApp({
      db,
      identity,
      permission,
      storage: { put: async () => {}, get: async () => new Uint8Array(), delete: async () => {} },
      event: new NoopEventAdapter(),
      linkHmacSecret: SECRET,
    })

    const post = await app.request('/api/v1/grants', {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: JSON.stringify({
        resourceType: 'workbook',
        resourceId: wb.id,
        granteeType: 'public_link',
        permission: 'view',
      }),
    })
    const { linkToken } = (await post.json()) as { linkToken: string }

    const repo = createGrantRepository(db)
    const ctxBase = {
      identity: { tenantId: tenant.id, userId: 'anonymous' },
      resource: { type: 'workbook' as const, id: wb.id, tenantId: tenant.id },
      workbookOwnerId: 'owner',
      workbookTenantId: tenant.id,
      workbookFolderId: null as string | null,
      folderAncestors: async () => [],
      findGrants: (refs: Parameters<ReturnType<typeof createGrantRepository>['findGrants']>[0]) =>
        repo.findGrants(refs),
      linkHmacSecret: SECRET,
    }

    const ok = await resolveCapability({ ...ctxBase, publicLinkToken: linkToken })
    expect(ok.canView).toBe(true)
    const wrong = await resolveCapability({ ...ctxBase, publicLinkToken: 'not-the-token' })
    expect(wrong.canView).toBe(false)
  })
})
