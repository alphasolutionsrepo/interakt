ALTER TABLE "search_events" ADD COLUMN "trigger_step" varchar(50);--> statement-breakpoint
-- Every 'system' search before this loaded a field's values (List Values, the chat's filter values,
-- query understanding); which one ran it wasn't recorded.
UPDATE "search_events" SET "trigger_type" = 'ai_step', "trigger_step" = 'field_values_legacy' WHERE "trigger_type" = 'system';
