CREATE TYPE "public"."data_source_field_role" AS ENUM('title', 'description', 'content', 'price', 'image', 'category', 'id', 'url', 'date');--> statement-breakpoint
CREATE TYPE "public"."data_source_status" AS ENUM('healthy', 'degraded', 'error', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."data_source_type" AS ENUM('search_index', 'search_index_external', 'file_store', 'database');--> statement-breakpoint
CREATE TYPE "public"."session_message_role" AS ENUM('user', 'assistant', 'system', 'tool_result');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('active', 'expired', 'archived');--> statement-breakpoint
CREATE TYPE "public"."tool_fallback_type" AS ENUM('default_response', 'alternative_tool', 'skip', 'error_message');--> statement-breakpoint
CREATE TYPE "public"."tool_status" AS ENUM('healthy', 'degraded', 'error', 'unknown');--> statement-breakpoint
CREATE TABLE "data_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"type" "data_source_type" NOT NULL,
	"config" json NOT NULL,
	"schema" json,
	"search_index_id" uuid,
	"status" "data_source_status" DEFAULT 'unknown' NOT NULL,
	"last_health_check_at" timestamp with time zone,
	"last_health_message" text,
	"document_count" integer,
	"storage_size_bytes" bigint,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_sources_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "ai_session_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"role" "session_message_role" NOT NULL,
	"content" text NOT NULL,
	"turn_index" integer NOT NULL,
	"metadata" json,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"embedding" vector(1536)
);
--> statement-breakpoint
CREATE TABLE "ai_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ai_experience_id" uuid NOT NULL,
	"summary" text,
	"facts" json DEFAULT '{}'::json,
	"pipeline_state" json DEFAULT '{}'::json,
	"last_tool_results" json DEFAULT '{}'::json,
	"user_context" json,
	"status" "session_status" DEFAULT 'active' NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"summarized_up_to" integer DEFAULT 0 NOT NULL,
	"client_metadata" json,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tools" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
UPDATE "tools" SET "type" = 'search' WHERE "type" = 'search_provider';--> statement-breakpoint
DROP TYPE "public"."tool_type";--> statement-breakpoint
CREATE TYPE "public"."tool_type" AS ENUM('search', 'lookup', 'http_api', 'web_search', 'ai_responder', 'mcp_server', 'user_action');--> statement-breakpoint
ALTER TABLE "tools" ALTER COLUMN "type" SET DATA TYPE "public"."tool_type" USING "type"::"public"."tool_type";--> statement-breakpoint
DROP INDEX "ai_experiences_telemetry_detail_level_idx";--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "timeout" integer DEFAULT 30000 NOT NULL;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "retry_config" json DEFAULT '{"count":2,"backoff":"exponential"}'::json NOT NULL;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "fallback_config" json;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "health_check_config" json;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "data_source_id" uuid;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "status" "tool_status" DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "last_health_check_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "last_health_message" text;--> statement-breakpoint
ALTER TABLE "ai_experiences" ADD COLUMN "icon" varchar(100);--> statement-breakpoint
ALTER TABLE "ai_experiences" ADD COLUMN "pipeline_config" json;--> statement-breakpoint
ALTER TABLE "ai_experiences" ADD COLUMN "persona_config" json NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_experiences" ADD COLUMN "guardrail_config" json;--> statement-breakpoint
ALTER TABLE "ai_experiences" ADD COLUMN "session_config" json NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_experiences" ADD COLUMN "access_config" json NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_experiences" ADD COLUMN "observability_config" json NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_experiences" ADD COLUMN "provider_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_experiences" ADD COLUMN "model_id" integer;--> statement-breakpoint
ALTER TABLE "data_sources" ADD CONSTRAINT "data_sources_search_index_id_search_index_id_fk" FOREIGN KEY ("search_index_id") REFERENCES "public"."search_index"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_session_messages" ADD CONSTRAINT "ai_session_messages_session_id_ai_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."ai_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_sessions" ADD CONSTRAINT "ai_sessions_ai_experience_id_ai_experiences_id_fk" FOREIGN KEY ("ai_experience_id") REFERENCES "public"."ai_experiences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_sources_slug_idx" ON "data_sources" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "data_sources_type_idx" ON "data_sources" USING btree ("type");--> statement-breakpoint
CREATE INDEX "data_sources_status_idx" ON "data_sources" USING btree ("status");--> statement-breakpoint
CREATE INDEX "data_sources_is_active_idx" ON "data_sources" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "data_sources_search_index_id_idx" ON "data_sources" USING btree ("search_index_id");--> statement-breakpoint
CREATE INDEX "ai_session_messages_session_idx" ON "ai_session_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "ai_session_messages_session_turn_idx" ON "ai_session_messages" USING btree ("session_id","turn_index");--> statement-breakpoint
CREATE INDEX "ai_session_messages_session_role_idx" ON "ai_session_messages" USING btree ("session_id","role");--> statement-breakpoint
CREATE INDEX "ai_session_messages_created_at_idx" ON "ai_session_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_session_messages_embedding_idx" ON "ai_session_messages" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "ai_sessions_experience_idx" ON "ai_sessions" USING btree ("ai_experience_id");--> statement-breakpoint
CREATE INDEX "ai_sessions_status_idx" ON "ai_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_sessions_last_active_idx" ON "ai_sessions" USING btree ("last_active_at");--> statement-breakpoint
CREATE INDEX "ai_sessions_expires_at_idx" ON "ai_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "ai_sessions_experience_status_idx" ON "ai_sessions" USING btree ("ai_experience_id","status");--> statement-breakpoint
ALTER TABLE "tools" ADD CONSTRAINT "tools_data_source_id_data_sources_id_fk" FOREIGN KEY ("data_source_id") REFERENCES "public"."data_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tools_status_idx" ON "tools" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tools_data_source_id_idx" ON "tools" USING btree ("data_source_id");--> statement-breakpoint
CREATE INDEX "ai_experiences_pipeline_mode_idx" ON "ai_experiences" USING btree ("pipeline_mode");--> statement-breakpoint
ALTER TABLE "ai_experiences" DROP COLUMN "ai_config";--> statement-breakpoint
ALTER TABLE "ai_experiences" DROP COLUMN "allowed_origins";--> statement-breakpoint
ALTER TABLE "ai_experiences" DROP COLUMN "rate_limit_config";--> statement-breakpoint
ALTER TABLE "ai_experiences" DROP COLUMN "telemetry_detail_level";