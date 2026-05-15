CREATE TABLE IF NOT EXISTS "mutations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workbook_id" uuid NOT NULL,
	"seq_num" bigint NOT NULL,
	"user_id" text NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mutations" ADD CONSTRAINT "mutations_workbook_id_workbooks_id_fk" FOREIGN KEY ("workbook_id") REFERENCES "public"."workbooks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mutations_workbook_seq_unique" ON "mutations" USING btree ("workbook_id","seq_num");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mutations_workbook_seq_idx" ON "mutations" USING btree ("workbook_id","seq_num");