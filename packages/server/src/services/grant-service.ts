import { timingSafeEqual } from 'node:crypto'
import type { Capability, IdentityContext, ResourceRef } from '../adapters/types'

/**
 * Constant-time string equality for public_link tokens.
 *
 * NOTE: grant.granteeId stores the public_link token in cleartext (Sprint 2
 * design). This blocks timing-attack-based token recovery but DB compromise
 * still leaks tokens. Sprint 4 may wrap with HMAC + server secret.
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
  permission: 'view' | 'edit' | 'manage'
  expiresAt: Date | null
}

export interface GrantContext {
  identity: IdentityContext
  resource: ResourceRef
  workbookOwnerId: string
  workbookFolderId: string | null
  folderAncestors: () => Promise<string[]>
  findGrants: (refs: Array<{ resourceType: 'folder' | 'workbook'; resourceId: string }>) => Promise<Grant[]>
  publicLinkToken?: string | undefined
}

const EMPTY: Capability = { canView: false, canEdit: false, canShare: false, canDelete: false }

function levelToCapability(level: Grant['permission']): Capability {
  switch (level) {
    case 'view':   return { canView: true, canEdit: false, canShare: false, canDelete: false }
    case 'edit':   return { canView: true, canEdit: true,  canShare: false, canDelete: false }
    case 'manage': return { canView: true, canEdit: true,  canShare: true,  canDelete: true  }
  }
}

function merge(a: Capability, b: Capability): Capability {
  return {
    canView:   a.canView   || b.canView,
    canEdit:   a.canEdit   || b.canEdit,
    canShare:  a.canShare  || b.canShare,
    canDelete: a.canDelete || b.canDelete,
  }
}

function isApplicable(grant: Grant, identity: IdentityContext, presentedToken?: string): boolean {
  if (grant.expiresAt && grant.expiresAt.getTime() < Date.now()) return false
  switch (grant.granteeType) {
    case 'user':          return grant.granteeId === identity.userId
    case 'tenant_member': return true
    case 'public_link':
      return !!presentedToken && !!grant.granteeId && safeStringEq(grant.granteeId, presentedToken)
  }
}

export async function resolveCapability(ctx: GrantContext): Promise<Capability> {
  if (ctx.workbookOwnerId === ctx.identity.userId) {
    return { canView: true, canEdit: true, canShare: true, canDelete: true }
  }
  const refs: Array<{ resourceType: 'folder' | 'workbook'; resourceId: string }> = [
    { resourceType: ctx.resource.type, resourceId: ctx.resource.id },
  ]
  const ancestors = ctx.workbookFolderId ? await ctx.folderAncestors() : []
  for (const fid of ancestors) refs.push({ resourceType: 'folder', resourceId: fid })

  const grants = await ctx.findGrants(refs)
  let acc: Capability = EMPTY
  for (const g of grants) {
    if (isApplicable(g, ctx.identity, ctx.publicLinkToken)) {
      acc = merge(acc, levelToCapability(g.permission))
    }
  }
  return acc
}
