CREATE TABLE "admin_chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"messages" json DEFAULT '[]'::json NOT NULL,
	"provider_id" varchar(255),
	"model_id" integer,
	"total_tokens" integer DEFAULT 0,
	"total_input_tokens" integer DEFAULT 0,
	"total_output_tokens" integer DEFAULT 0,
	"message_count" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "idx_admin_chat_sessions_created" ON "admin_chat_sessions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_admin_chat_sessions_last_message" ON "admin_chat_sessions" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "idx_admin_chat_sessions_title" ON "admin_chat_sessions" USING btree ("title");