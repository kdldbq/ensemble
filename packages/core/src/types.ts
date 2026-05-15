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
