ALTER TABLE "search_index" ADD COLUMN "ingest_token" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
CREATE INDEX "search_index_ingest_token_idx" ON "search_index" USING btree ("ingest_token");--> statement-breakpoint
ALTER TABLE "search_index" ADD CONSTRAINT "search_index_ingest_token_unique" UNIQUE("ingest_token");