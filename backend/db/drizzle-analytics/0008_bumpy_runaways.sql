ALTER TABLE "admin_chat_sessions" ADD COLUMN "experience_id" uuid;--> statement-breakpoint
ALTER TABLE "admin_chat_sessions" ADD COLUMN "experience_name" varchar(255);--> statement-breakpoint
CREATE INDEX "idx_admin_chat_sessions_experience" ON "admin_chat_sessions" USING btree ("experience_id");