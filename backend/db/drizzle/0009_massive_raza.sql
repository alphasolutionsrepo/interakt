ALTER TABLE "chat_sessions" ADD COLUMN "pipeline_state" json;--> statement-breakpoint
ALTER TABLE "search_experiences" ADD COLUMN "chat_pipeline_mode" text DEFAULT 'agentic';