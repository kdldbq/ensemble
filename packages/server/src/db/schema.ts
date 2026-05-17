import { sql } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const spaceType = pgEnum('space_type', ['personal', 'shared'])
export const snapshotReason = pgEnum('snapshot_reason', ['auto', 'manual', 'named'])

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const folders = pgTable(
  'folders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    parentId: uuid('parent_id'),
    name: text('name').notNull(),
    ownerId: text('owner_id').notNull(),
    spaceType: spaceType('space_type').notNull(),
    position: integer('position').notNull().default(0),
    isDeleted: boolean('is_deleted').notNull().default(false),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantParentIdx: index('folders_tenant_parent_idx').on(t.tenantId, t.parentId),
    tenantDeletedIdx: index('folders_tenant_deleted_idx').on(t.tenantId, t.isDeleted),
  }),
)

export const workbooks = pgTable(
  'workbooks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    folderId: uuid('folder_id').references(() => folders.id),
    name: text('name').notNull(),
    ownerId: text('owner_id').notNull(),
    currentSnapshotId: uuid('current_snapshot_id'),
    position: integer('position').notNull().default(0),
    isDeleted: boolean('is_deleted').notNull().default(false),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantFolderIdx: index('workbooks_tenant_folder_idx').on(t.tenantId, t.folderId),
  }),
)

export const snapshots = pgTable('snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  workbookId: uuid('workbook_id')
    .notNull()
    .references(() => workbooks.id),
  storageKey: text('storage_key').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  reason: snapshotReason('reason').notNull().default('auto'),
  name: text('name'),
})

export const grantResourceType = pgEnum('grant_resource_type', ['folder', 'workbook'])
export const granteeType = pgEnum('grantee_type', ['user', 'tenant_member', 'public_link'])
export const permissionLevel = pgEnum('permission_level', ['view', 'edit', 'manage'])

export const shareGrants = pgTable('share_grants', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  resourceType: grantResourceType('resource_type').notNull(),
  resourceId: uuid('resource_id').notNull(),
  granteeType: granteeType('grantee_type').notNull(),
  granteeId: text('grantee_id'),
  permission: permissionLevel('permission').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  /**
   * Optional password gate for public_link grants. Stored as
   * `scrypt$<salt_hex>$<derived_hex>` (see services/password.ts).
   */
  passwordHash: text('password_hash'),
  grantedBy: text('granted_by').notNull(),
  grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
})

export const mutations = pgTable(
  'mutations',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    workbookId: uuid('workbook_id')
      .notNull()
      .references(() => workbooks.id),
    seqNum: bigint('seq_num', { mode: 'number' }).notNull(),
    userId: text('user_id').notNull(),
    appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb('payload').notNull(),
  },
  (t) => ({
    workbookSeqUnique: uniqueIndex('mutations_workbook_seq_unique').on(t.workbookId, t.seqNum),
    workbookSeqAsc: index('mutations_workbook_seq_idx').on(t.workbookId, t.seqNum),
  }),
)

export const auditEventType = pgEnum('audit_event_type', [
  'workbook.created',
  'workbook.opened',
  'workbook.edited',
  'workbook.deleted',
  'workbook.moved',
  'folder.created',
  'folder.renamed',
  'folder.moved',
  'folder.deleted',
  'folder.restored',
  'share.granted',
  'share.revoked',
])

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventType: auditEventType('event_type').notNull(),
    actorId: text('actor_id').notNull(),
    resourceId: uuid('resource_id'),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantOccurredIdx: index('audit_log_tenant_occurred_idx').on(t.tenantId, t.occurredAt),
  }),
)
