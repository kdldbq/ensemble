ALTER TYPE "public"."audit_event_type" ADD VALUE 'comment.created';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE 'comment.resolved';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE 'comment.unresolved';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE 'comment.deleted';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE 'comment.mentioned';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"workbook_id" uuid NOT NULL,
	"thread_id" text NOT NULL,
	"cell_ref" text,
	"parent_id" uuid,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"mentions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comments" ADD CONSTRAINT "comments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comments" ADD CONSTRAINT "comments_workbook_id_workbooks_id_fk" FOREIGN KEY ("workbook_id") REFERENCES "public"."workbooks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comments_workbook_thread_idx" ON "comments" USING btree ("workbook_id","thread_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comments_workbook_resolved_idx" ON "comments" USING btree ("workbook_id","resolved");