-- Let search experiences search external indexes.
--
-- An external index is a data source of type `search_index_external`: an engine
-- Interakt queries but does not own (an existing Elasticsearch or Azure AI Search
-- index, Sitecore Search, ...). Until now only chat tools could use one. This
-- junction table lets a search experience list them next to its managed indexes.
--
-- Separate from search_experience_indexes on purpose: that table's search_index_id
-- stays NOT NULL, so nothing that reads managed indexes changes.
CREATE TABLE IF NOT EXISTS "search_experience_external_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"search_experience_id" uuid NOT NULL,
	"data_source_id" uuid NOT NULL,
	"weight" real DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "se_external_sources_unique" UNIQUE("search_experience_id","data_source_id")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "search_experience_external_sources" ADD CONSTRAINT "search_experience_external_sources_search_experience_id_search_experiences_id_fk" FOREIGN KEY ("search_experience_id") REFERENCES "public"."search_experiences"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "search_experience_external_sources" ADD CONSTRAINT "search_experience_external_sources_data_source_id_data_sources_id_fk" FOREIGN KEY ("data_source_id") REFERENCES "public"."data_sources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "se_external_sources_experience_idx" ON "search_experience_external_sources" USING btree ("search_experience_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "se_external_sources_data_source_idx" ON "search_experience_external_sources" USING btree ("data_source_id");
