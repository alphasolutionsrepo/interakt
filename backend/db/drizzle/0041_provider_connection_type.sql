CREATE TYPE "public"."ai_connection_type" AS ENUM('openai_compatible', 'ollama');--> statement-breakpoint
ALTER TABLE "ai_providers" ADD COLUMN "connection_type" "ai_connection_type" DEFAULT 'openai_compatible' NOT NULL;--> statement-breakpoint
-- Providers added before connection types: the Ollama one speaks Ollama
UPDATE "ai_providers" SET "connection_type" = 'ollama' WHERE "provider_key" = 'ollama';
