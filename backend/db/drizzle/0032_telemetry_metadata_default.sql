-- Search and chat experiences record metadata traces by default.
--
-- Telemetry levels are now loaded for every experience, 'off' included. Before,
-- 'off' rows were skipped at startup, so an experience set to 'off' was traced
-- again after the next restart. 'off' was also the default (the search column, the
-- chat validation, the chat edit form), so nearly every experience holds it without
-- anyone having chosen it, and honouring it now would silently stop traces after
-- an upgrade. An 'off' row can't be told apart from an untouched default: move
-- them to 'metadata' (timings and counts, no query or message text). Anyone who
-- wants no traces sets 'off' again on the experience, and now it sticks.
ALTER TABLE "search_experiences" ALTER COLUMN "telemetry_detail_level" SET DEFAULT 'metadata';--> statement-breakpoint
UPDATE "search_experiences" SET "telemetry_detail_level" = 'metadata' WHERE "telemetry_detail_level" = 'off';--> statement-breakpoint
UPDATE "ai_experiences"
SET "observability_config" = jsonb_set("observability_config"::jsonb, '{telemetryDetailLevel}', '"metadata"')::json
WHERE "observability_config"->>'telemetryDetailLevel' = 'off';
