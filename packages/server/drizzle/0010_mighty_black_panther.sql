ALTER TYPE "public"."audit_event_type" ADD VALUE 'protection.created';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE 'protection.deleted';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "range_protections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"workbook_id" uuid NOT NULL,
	"sheet_id" text NOT NULL,
	"range_ref" text NOT NULL,
	"description" text,
	"allowed_user_ids" jsonb,
	"allowed_roles" jsonb,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "range_protections" ADD CONSTRAINT "range_protections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "range_protections" ADD CONSTRAINT "range_protections_workbook_id_workbooks_id_fk" FOREIGN KEY ("workbook_id") REFERENCES "public"."workbooks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "range_protections_workbook_sheet_idx" ON "range_protections" USING btree ("workbook_id","sheet_id");