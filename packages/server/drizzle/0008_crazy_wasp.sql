ALTER TYPE "public"."audit_event_type" ADD VALUE 'workbook.deleted' BEFORE 'folder.created';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE 'workbook.moved' BEFORE 'folder.created';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE 'folder.renamed' BEFORE 'share.granted';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE 'folder.moved' BEFORE 'share.granted';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE 'folder.deleted' BEFORE 'share.granted';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE 'folder.restored' BEFORE 'share.granted';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE 'share.revoked';--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workbooks" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workbooks" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "folders_tenant_parent_idx" ON "folders" USING btree ("tenant_id","parent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "folders_tenant_deleted_idx" ON "folders" USING btree ("tenant_id","is_deleted");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workbooks_tenant_folder_idx" ON "workbooks" USING btree ("tenant_id","folder_id");