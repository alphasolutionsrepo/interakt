ALTER TABLE "chat_sessions" ADD COLUMN "conversation_origin" json;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "active_search_context" json;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "conversation_summary" json;--> statement-breakpoint
ALTER TABLE "chat_sessions" DROP COLUMN "initial_context";--> statement-breakpoint
ALTER TABLE "chat_sessions" DROP COLUMN "conversation_context";