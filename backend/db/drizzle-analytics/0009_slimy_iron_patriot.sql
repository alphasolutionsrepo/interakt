ALTER TABLE "search_events" ADD COLUMN "trigger_step" varchar(50);--> statement-breakpoint
-- 'system' searches came from two places before this: the List Values tool in a chat (the only
-- place that sets an experience on such a search) and a search experience's query understanding.
UPDATE "search_events" SET "trigger_type" = 'ai_tool', "trigger_step" = 'enumerate' WHERE "trigger_type" = 'system' AND "experience_id" IS NOT NULL;--> statement-breakpoint
UPDATE "search_events" SET "trigger_type" = 'ai_step', "trigger_step" = 'query_interpretation' WHERE "trigger_type" = 'system' AND "experience_id" IS NULL;
