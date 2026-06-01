DO $$ BEGIN
  CREATE TYPE "public"."data_source_operation" AS ENUM('search', 'inspect', 'enumerate', 'lookup', 'query');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."executor_type" AS ENUM('data_source', 'http', 'mcp', 'ai_call');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DROP INDEX IF EXISTS "tools_type_idx";--> statement-breakpoint
ALTER TABLE "tools" ALTER COLUMN "type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tools" ALTER COLUMN "config" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN IF NOT EXISTS "executor_type" "executor_type" DEFAULT 'data_source' NOT NULL;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN IF NOT EXISTS "operation" "data_source_operation";--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN IF NOT EXISTS "executor_config" json;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN IF NOT EXISTS "is_system" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tools_executor_type_idx" ON "tools" USING btree ("executor_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tools_operation_idx" ON "tools" USING btree ("operation");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tools_is_system_idx" ON "tools" USING btree ("is_system");--> statement-breakpoint
UPDATE "tools" SET
  "executor_type" = CASE
    WHEN "type" = 'search'       THEN 'data_source'::"executor_type"
    WHEN "type" = 'lookup'       THEN 'data_source'::"executor_type"
    WHEN "type" = 'http_api'     THEN 'http'::"executor_type"
    WHEN "type" = 'web_search'   THEN 'http'::"executor_type"
    WHEN "type" = 'ai_responder' THEN 'ai_call'::"executor_type"
    WHEN "type" = 'mcp_server'   THEN 'mcp'::"executor_type"
    WHEN "type" = 'user_action'  THEN 'http'::"executor_type"
    ELSE 'data_source'::"executor_type"
  END,
  "operation" = CASE
    WHEN "type" = 'search'  THEN 'search'::"data_source_operation"
    WHEN "type" = 'lookup'  THEN 'lookup'::"data_source_operation"
    ELSE NULL
  END,
  "executor_config" = "config"
WHERE "executor_type" = 'data_source' AND "operation" IS NULL AND "type" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "tools" DROP COLUMN "type";--> statement-breakpoint
ALTER TABLE "tools" DROP COLUMN "config";--> statement-breakpoint
DROP TYPE "public"."tool_type";
