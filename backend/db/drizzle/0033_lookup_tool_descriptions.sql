-- Find Record tools on a search index say they take an id, a SKU or a name.
--
-- The lookup on a managed or external search index falls back to a search and keeps only
-- the item asked for, so a name works as well as an id. The planner is now told so, but
-- each tool also stores its own description and input schema, generated when it was
-- created: "by ID ... when you have a specific document ID". Left alone, those would
-- contradict the planner. Only text that is exactly the old generated default is replaced
-- (rebuilt per row from the tool's data source name); a description or schema an admin
-- wrote, or one generated under an earlier data source name, is not touched. Per-experience
-- overrides (ai_experience_tools.override_ai_description) are not touched either.
-- File-store lookups take a chunk id only and keep their text.
-- The generator adds 'The document ID field is "<field>".' after the template when the
-- source has an id field; that sentence is still true, so it is kept. Anything else after
-- the template means someone edited it.
UPDATE "tools" AS t
SET "ai_description" = 'Look up one specific item in "' || ds."name" || '" by its ID, SKU or full name. '
  || 'Use this when the user asks about that item, not similar ones. Returns found: false when no item matches.'
  || substr(t."ai_description", length(old.text) + 1)
FROM "data_sources" AS ds,
  LATERAL (SELECT 'Look up a specific item by ID from "' || ds."name" || '". '
    || 'Use this when you have a specific document ID and need its full details.' AS text) AS old
WHERE ds."id" = t."data_source_id"
  AND t."operation" = 'lookup'
  AND ds."type" = 'search_index'
  AND left(t."ai_description", length(old.text)) = old.text
  AND substr(t."ai_description", length(old.text) + 1) ~ '^(\n\nThe document ID field is "[^"\n]+"\.)?$';--> statement-breakpoint
UPDATE "tools" AS t
SET "ai_description" = 'Look up one specific item in the external "' || ds."name" || '" index by its ID, SKU or full name. '
  || 'Use this when the user asks about that item, not similar ones. Returns found: false when no item matches.'
  || substr(t."ai_description", length(old.text) + 1)
FROM "data_sources" AS ds,
  LATERAL (SELECT 'Look up a specific document by ID from the external "' || ds."name" || '" index.' AS text) AS old
WHERE ds."id" = t."data_source_id"
  AND t."operation" = 'lookup'
  AND ds."type" = 'search_index_external'
  AND left(t."ai_description", length(old.text)) = old.text
  AND substr(t."ai_description", length(old.text) + 1) ~ '^(\n\nThe document ID field is "[^"\n]+"\.)?$';--> statement-breakpoint
-- The input schema, when it is exactly one of the two old defaults (the executor's, or the
-- create wizard's copy).
UPDATE "tools" AS t
SET "input_schema" = '{"type":"object","properties":{"id":{"type":"string","description":"The item''s ID, SKU or full name, as the user gave it"}},"required":["id"]}'::json
FROM "data_sources" AS ds
WHERE ds."id" = t."data_source_id"
  AND t."operation" = 'lookup'
  AND ds."type" IN ('search_index', 'search_index_external')
  AND t."input_schema"::jsonb IN (
    '{"type":"object","properties":{"id":{"type":"string","description":"The unique identifier of the document to retrieve"}},"required":["id"]}'::jsonb,
    '{"type":"object","properties":{"id":{"type":"string","description":"The unique identifier of the document"}},"required":["id"]}'::jsonb
  );
