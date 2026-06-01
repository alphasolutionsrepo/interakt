DO $$ BEGIN CREATE TYPE "public"."knowledge_document_status" AS ENUM('pending', 'processing', 'ready', 'failed'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"data_source_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"data_source_id" uuid NOT NULL,
	"name" varchar(500) NOT NULL,
	"mime_type" varchar(100),
	"size_bytes" integer,
	"status" "knowledge_document_status" DEFAULT 'pending' NOT NULL,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"ai_experience_id" uuid NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"confidence" real DEFAULT 1 NOT NULL,
	"source_session_id" uuid,
	"retrieval_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_retrieved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "data_template_fields" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "data_templates" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chat_sessions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "data_template_fields" CASCADE;--> statement-breakpoint
DROP TABLE "data_templates" CASCADE;--> statement-breakpoint
DROP TABLE "chat_sessions" CASCADE;--> statement-breakpoint
ALTER TABLE "search_index" DROP CONSTRAINT IF EXISTS "search_index_data_template_id_data_templates_id_fk";
--> statement-breakpoint
ALTER TABLE "search_index_fields" DROP CONSTRAINT IF EXISTS "search_index_fields_original_template_field_id_data_template_fields_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "search_index_data_template_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_sif_template_field_ref";--> statement-breakpoint
ALTER TABLE "search_index" ALTER COLUMN "data_template_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN IF NOT EXISTS "display_config" json;--> statement-breakpoint
ALTER TABLE "ai_experiences" ADD COLUMN IF NOT EXISTS "agentic_config" json;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_document_id_knowledge_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_data_source_id_data_sources_id_fk" FOREIGN KEY ("data_source_id") REFERENCES "public"."data_sources"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_data_source_id_data_sources_id_fk" FOREIGN KEY ("data_source_id") REFERENCES "public"."data_sources"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "user_memories" ADD CONSTRAINT "user_memories_ai_experience_id_ai_experiences_id_fk" FOREIGN KEY ("ai_experience_id") REFERENCES "public"."ai_experiences"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "user_memories" ADD CONSTRAINT "user_memories_source_session_id_ai_sessions_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "public"."ai_sessions"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_chunks_document_idx" ON "knowledge_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_chunks_data_source_idx" ON "knowledge_chunks" USING btree ("data_source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_chunks_document_chunk_idx" ON "knowledge_chunks" USING btree ("document_id","chunk_index");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_chunks_embedding_idx" ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_documents_data_source_idx" ON "knowledge_documents" USING btree ("data_source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_documents_data_source_status_idx" ON "knowledge_documents" USING btree ("data_source_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_memories_user_experience_idx" ON "user_memories" USING btree ("user_id","ai_experience_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_memories_source_session_idx" ON "user_memories" USING btree ("source_session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_memories_embedding_idx" ON "user_memories" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
ALTER TABLE "search_experiences" DROP COLUMN IF EXISTS "chat_pipeline_mode";