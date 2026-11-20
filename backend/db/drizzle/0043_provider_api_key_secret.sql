ALTER TABLE "ai_providers" ADD COLUMN "api_key_secret" varchar(100);--> statement-breakpoint
ALTER TABLE "ai_providers" ADD COLUMN "api_key_secret_managed" boolean DEFAULT false NOT NULL;