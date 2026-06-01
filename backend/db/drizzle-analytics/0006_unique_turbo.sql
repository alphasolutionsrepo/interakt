ALTER TABLE "admin_chat_sessions" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "admin_chat_sessions" ADD COLUMN "facts" jsonb DEFAULT '{}'::jsonb;