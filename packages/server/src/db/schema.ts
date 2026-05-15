import { boolean, pgEnum, pgTable, text, timestamp, uuid, bigint } from 'drizzle-orm/pg-core'

export const spaceType = pgEnum('space_type', ['personal', 'shared'])
export const snapshotReason = pgEnum('snapshot_reason', ['auto', 'manual', 'named'])

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const folders = pgTable('folders', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  parentId: uuid('parent_id'),
  name: text('name').notNull(),
  ownerId: text('owner_id').notNull(),
  spaceType: spaceType('space_type').notNull(),
  isDeleted: boolean('is_deleted').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const workbooks = pgTable('workbooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  folderId: uuid('folder_id').references(() => folders.id),
  name: text('name').notNull(),
  ownerId: text('owner_id').notNull(),
  currentSnapshotId: uuid('current_snapshot_id'),
  isDeleted: boolean('is_deleted').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const snapshots = pgTable('snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  workbookId: uuid('workbook_id').notNull().references(() => workbooks.id),
  storageKey: text('storage_key').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  reason: snapshotReason('reason').notNull().default('auto'),
  name: text('name'),
})
