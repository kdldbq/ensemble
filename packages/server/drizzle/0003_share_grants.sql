CREATE TYPE "public"."grant_resource_type" AS ENUM('folder', 'workbook');--> statement-breakpoint
CREATE TYPE "public"."grantee_type" AS ENUM('user', 'tenant_member', 'public_link');--> statement-breakpoint
CREATE TYPE "public"."permission_level" AS ENUM('view', 'edit', 'manage');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "share_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"resource_type" "grant_resource_type" NOT NULL,
	"resource_id" uuid NOT NULL,
	"grantee_type" "grantee_type" NOT NULL,
	"grantee_id" text,
	"permission" "permission_level" NOT NULL,
	"expires_at" timestamp with time zone,
	"granted_by" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "share_grants" ADD CONSTRAINT "share_grants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
