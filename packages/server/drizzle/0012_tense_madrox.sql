-- Backfill caveat: existing audit_log rows get row_hash = prev_hash =
-- chain_hash = '' (the DEFAULT). Real hashes are never empty, so any
-- future chain-verification routine MUST SKIP rows where row_hash = ''
-- (they are pre-migration and unverifiable). New inserts from
-- event-emitter.ts compute real hashes; the first post-migration row
-- per tenant treats the empty backfill as genesis.
ALTER TABLE "audit_log" ADD COLUMN "row_hash" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "prev_hash" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "chain_hash" text DEFAULT '' NOT NULL;