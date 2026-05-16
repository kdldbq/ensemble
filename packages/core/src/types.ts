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
  isDeleted: boolean
  createdAt: string
  updatedAt: string
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
}

export interface Version {
  id: string
  workbookId: string
  name: string
  createdBy: string
  createdAt: string
}
