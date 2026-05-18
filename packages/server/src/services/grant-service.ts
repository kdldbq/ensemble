import { timingSafeEqual } from 'node:crypto'
import type { Capability, IdentityContext, ResourceRef } from '../adapters/types'
import { constantTimeHexEq, hmacLinkToken } from './link-token'

/**
 * Constant-time string equality for legacy cleartext public_link tokens.
 *
 * Used only for the dual-path fallback: legacy grants created before the
 * HMAC migration store cleartext in `granteeId` with `linkTokenHmac=NULL`.
 * New grants store HMAC only (see {@link verifyLinkTokenHmac}).
 */
function safeStringEq(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

export interface Grant {
  resourceType: 'folder' | 'workbook'
  resourceId: string
  granteeType: 'user' | 'tenant_member' | 'public_link'
  granteeId: string | null
  /**
   * HMAC-SHA256(secret, cleartext_token) for public_link grants. Null for
   * legacy rows created before the HMAC migration (dual-path fallback uses
   * `granteeId` cleartext compare for those).
   */
  linkTokenHmac?: string | null
  permission: 'view' | 'edit' | 'manage'
  expiresAt: Date | null
}

export interface GrantContext {
  identity: IdentityContext
  resource: ResourceRef
  workbookOwnerId: string
  /**
   * Tenant that owns the workbook. The workbook-owner short-circuit MUST
   * verify identity.tenantId === workbookTenantId before granting full
   * capability — otherwise an attacker whose userId happens to collide
   * with another tenant's workbook owner would inherit that workbook.
   * UUID collisions are vanishingly rare but defense-in-depth.
   */
  workbookTenantId: string
  workbookFolderId: string | null
  folderAncestors: () => Promise<string[]>
  findGrants: (
    refs: Array<{ resourceType: 'folder' | 'workbook'; resourceId: string }>,
  ) => Promise<Grant[]>
  publicLinkToken?: string | undefined
  /**
   * HMAC secret used to verify `Grant.linkTokenHmac`. Absent contexts cannot
   * match HMAC-only rows — the grant is ignored, never matched cleartext-
   * against-hmac (which would be both wrong and a silent downgrade).
   */
  linkHmacSecret?: string | undefined
}

const EMPTY: Capability = { canView: false, canEdit: false, canShare: false, canDelete: false }

function levelToCapability(level: Grant['permission']): Capability {
  switch (level) {
    case 'view':
      return {
        canView: true,
        canEdit: false,
        canShare: false,
        canDelete: false,
        canComment: false,
        canDownload: true,
        canPrint: true,
      }
    case 'edit':
      return {
        canView: true,
        canEdit: true,
        canShare: false,
        canDelete: false,
        canComment: true,
        canDownload: true,
        canPrint: true,
      }
    case 'manage':
      return {
        canView: true,
        canEdit: true,
        canShare: true,
        canDelete: true,
        canComment: true,
        canDownload: true,
        canPrint: true,
      }
  }
}

function merge(a: Capability, b: Capability): Capability {
  const out: Capability = {
    canView: a.canView || b.canView,
    canEdit: a.canEdit || b.canEdit,
    canShare: a.canShare || b.canShare,
    canDelete: a.canDelete || b.canDelete,
  }
  if (a.canComment !== undefined || b.canComment !== undefined) {
    out.canComment = Boolean(a.canComment) || Boolean(b.canComment)
  }
  if (a.canDownload !== undefined || b.canDownload !== undefined) {
    out.canDownload = Boolean(a.canDownload) || Boolean(b.canDownload)
  }
  if (a.canPrint !== undefined || b.canPrint !== undefined) {
    out.canPrint = Boolean(a.canPrint) || Boolean(b.canPrint)
  }
  return out
}

function isApplicable(
  grant: Grant,
  identity: IdentityContext,
  presentedToken: string | undefined,
  presentedHmacHex: string | undefined,
): boolean {
  if (grant.expiresAt && grant.expiresAt.getTime() < Date.now()) return false
  switch (grant.granteeType) {
    case 'user':
      return grant.granteeId === identity.userId
    case 'tenant_member':
      return true
    case 'public_link': {
      if (!presentedToken) return false
      // HMAC path: any non-null linkTokenHmac means this row uses the new
      // hashed format. Without a precomputed HMAC of the presented token we
      // MUST refuse — silently falling back to cleartext compare would let an
      // attacker downgrade.
      if (grant.linkTokenHmac) {
        return (
          presentedHmacHex !== undefined && constantTimeHexEq(presentedHmacHex, grant.linkTokenHmac)
        )
      }
      // Legacy / dual-path: pre-migration rows store cleartext in granteeId.
      return !!grant.granteeId && safeStringEq(grant.granteeId, presentedToken)
    }
  }
}

export async function resolveCapability(ctx: GrantContext): Promise<Capability> {
  if (
    ctx.workbookOwnerId === ctx.identity.userId &&
    ctx.workbookTenantId === ctx.identity.tenantId
  ) {
    return { canView: true, canEdit: true, canShare: true, canDelete: true }
  }
  const refs: Array<{ resourceType: 'folder' | 'workbook'; resourceId: string }> = [
    { resourceType: ctx.resource.type, resourceId: ctx.resource.id },
  ]
  const ancestors = ctx.workbookFolderId ? await ctx.folderAncestors() : []
  for (const fid of ancestors) refs.push({ resourceType: 'folder', resourceId: fid })

  const grants = await ctx.findGrants(refs)
  // Hash the presented token once — same input on every grant iteration.
  const presentedHmacHex =
    ctx.publicLinkToken && ctx.linkHmacSecret
      ? hmacLinkToken(ctx.linkHmacSecret, ctx.publicLinkToken)
      : undefined
  let acc: Capability = EMPTY
  for (const g of grants) {
    if (isApplicable(g, ctx.identity, ctx.publicLinkToken, presentedHmacHex)) {
      acc = merge(acc, levelToCapability(g.permission))
    }
  }
  return acc
}
