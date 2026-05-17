export interface IdentityContext {
  tenantId: string
  userId: string
  displayName?: string
  email?: string
  roles?: string[]
  custom?: Record<string, unknown>
}

export interface ResourceRef {
  type: 'folder' | 'workbook'
  id: string
  tenantId: string
}

export interface Capability {
  canView: boolean
  canEdit: boolean
  canShare: boolean
  canDelete: boolean
}

export type MaskMatch =
  | { type: 'column'; sheet: '*' | string; column: string }
  | { type: 'header'; sheet: '*' | string; headerText: string }
  | { type: 'row'; sheet: '*' | string; where: { field: string; op: 'eq' | 'in'; value: unknown } }

export type MaskAction =
  | { type: 'redact'; replacement: string }
  | { type: 'hash' }
  | { type: 'remove' }

export interface MaskRule {
  match: MaskMatch
  action: MaskAction
}

/**
 * Event payload published by EventAdapter.publish.
 *
 * All `at` fields are ISO-8601 timestamps (e.g. "2026-05-15T10:30:00.000Z").
 * EventAdapter implementations should treat publish as fire-and-forget:
 * errors must be swallowed and never propagated to the trigger caller.
 */
export type EnsembleEvent =
  | { type: 'workbook.created'; workbookId: string; userId: string; at: string }
  | { type: 'workbook.opened'; workbookId: string; userId: string; at: string }
  | {
      type: 'workbook.edited'
      workbookId: string
      userId: string
      batchedOpsCount: number
      at: string
    }
  | { type: 'workbook.deleted'; workbookId: string; userId: string; at: string }
  | {
      type: 'workbook.moved'
      workbookId: string
      userId: string
      fromFolderId: string | null
      toFolderId: string | null
      at: string
    }
  | { type: 'folder.created'; folderId: string; userId: string; at: string }
  | { type: 'folder.renamed'; folderId: string; userId: string; newName: string; at: string }
  | {
      type: 'folder.moved'
      folderId: string
      userId: string
      fromParentId: string | null
      toParentId: string | null
      at: string
    }
  | { type: 'folder.deleted'; folderId: string; userId: string; at: string }
  | { type: 'folder.restored'; folderId: string; userId: string; at: string }
  | { type: 'share.granted'; grantId: string; grantedBy: string; at: string }
  | { type: 'share.revoked'; grantId: string; revokedBy: string; at: string }
  | {
      type: 'protection.created'
      protectionId: string
      workbookId: string
      userId: string
      rangeRef: string
      at: string
    }
  | {
      type: 'protection.deleted'
      protectionId: string
      workbookId: string
      userId: string
      at: string
    }
