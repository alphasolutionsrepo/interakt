ALTER TABLE "search_experiences" ADD COLUMN "is_built_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_experiences" ADD COLUMN "is_built_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- The help experiences an earlier docs setup made are built in: the ones under its slugs, when
-- that setup's registry entry exists. Not matched by description: an admin may have edited it,
-- and the help must stay open to every signed-in user after the upgrade.
UPDATE "ai_experiences" SET "is_built_in" = true
WHERE "slug" = 'help-assistant'
  AND EXISTS (SELECT 1 FROM "seed_registry" WHERE "seed_type" = 'docs' AND "seed_key" = 'interakt-docs');--> statement-breakpoint
UPDATE "search_experiences" SET "is_built_in" = true
WHERE "slug" = 'interakt-docs'
  AND EXISTS (SELECT 1 FROM "seed_registry" WHERE "seed_type" = 'docs' AND "seed_key" = 'interakt-docs-search');
