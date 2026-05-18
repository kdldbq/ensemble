export interface Workbook {
  id: string
  tenantId: string
  folderId: string | null
  name: string
  ownerId: string
  currentSnapshotId: string | null
  createdAt: string
  updatedAt: string
}

export interface Snapshot {
  id: string
  workbookId: string
  storageKey: string
  sizeBytes: number
  createdBy: string
  createdAt: string
  reason: 'auto' | 'manual' | 'named'
  name: string | null
}

export interface UniverSheet {
  id: string
  name: string
  cellData: Record<string, Record<string, { v?: unknown; m?: string }>>
}

export interface UniverWorkbookData {
  id: string
  sheetOrder: string[]
  sheets: Record<string, UniverSheet>
}

export interface Folder {
  id: string
  tenantId: string
  parentId: string | null
  name: string
  ownerId: string
  spaceType: 'personal' | 'shared'
  position: number
  isDeleted: boolean
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface FolderTreeNode extends Folder {
  children: FolderTreeNode[]
  depth: number
}

export function buildFolderTree(flat: Folder[]): FolderTreeNode[] {
  const byParent = new Map<string | null, Folder[]>()
  for (const f of flat) {
    const key = f.parentId
    const list = byParent.get(key) ?? []
    list.push(f)
    byParent.set(key, list)
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt))
  }

  function build(parentId: string | null, depth: number): FolderTreeNode[] {
    const children = byParent.get(parentId) ?? []
    return children.map((f) => ({
      ...f,
      depth,
      children: build(f.id, depth + 1),
    }))
  }
  return build(null, 0)
}

export interface Grant {
  id: string
  tenantId: string
  resourceType: 'folder' | 'workbook'
  resourceId: string
  granteeType: 'user' | 'tenant_member' | 'public_link'
  granteeId: string | null
  permission: 'view' | 'edit' | 'manage'
  expiresAt: string | null
  grantedBy: string
  grantedAt: string
  /** True iff a password was set on this grant (passwordHash is never sent). */
  hasPassword?: boolean
  /**
   * Cleartext public_link token. Server-generated, returned exactly once in
   * the createGrant response when granteeType=public_link. Never present on
   * listGrants results — the server stores only the HMAC.
   */
  readonly linkToken?: string
}

export interface Version {
  id: string
  workbookId: string
  name: string
  createdBy: string
  createdAt: string
}

export interface ActivityEntry {
  id: string
  eventType: string
  actorId: string
  resourceId: string | null
  payload: Record<string, unknown>
  occurredAt: string
}

export interface Protection {
  id: string
  tenantId: string
  workbookId: string
  sheetId: string
  rangeRef: string
  description: string | null
  allowedUserIds: string[] | null
  allowedRoles: string[] | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface Comment {
  id: string
  tenantId: string
  workbookId: string
  threadId: string
  cellRef: string | null
  parentId: string | null
  authorId: string
  body: string
  mentions: string[]
  resolved: boolean
  resolvedBy: string | null
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
}
