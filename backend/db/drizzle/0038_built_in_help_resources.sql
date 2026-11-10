ALTER TABLE "search_index" ADD COLUMN "is_built_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "data_sources" ADD COLUMN "is_built_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "is_built_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- What an earlier docs setup made for the built-in help, when its registry entry exists: the docs
-- data source and its tools (Help Assistant), and the docs search index, by the names it gives them.
UPDATE "data_sources" SET "is_built_in" = true
WHERE "slug" = 'interakt-docs'
  AND EXISTS (SELECT 1 FROM "seed_registry" WHERE "seed_type" = 'docs' AND "seed_key" = 'interakt-docs');--> statement-breakpoint
-- Only the tools the setup generated there (system tools under the docs slug), not one someone added
UPDATE "tools" SET "is_built_in" = true
WHERE "data_source_id" IN (SELECT "id" FROM "data_sources" WHERE "is_built_in" = true)
  AND "is_system" = true AND "slug" LIKE 'interakt-docs-%';--> statement-breakpoint
UPDATE "search_index" SET "is_built_in" = true
WHERE "name" = 'interakt-docs'
  AND EXISTS (SELECT 1 FROM "seed_registry" WHERE "seed_type" = 'docs' AND "seed_key" = 'interakt-docs-search');
