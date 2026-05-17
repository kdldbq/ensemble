ALTER TABLE "audit_log" ADD COLUMN "row_hash" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "prev_hash" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "chain_hash" text DEFAULT '' NOT NULL;