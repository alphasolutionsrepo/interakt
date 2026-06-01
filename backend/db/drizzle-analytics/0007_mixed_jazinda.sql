ALTER TABLE "ai_usage_events" ADD COLUMN "source" varchar(20) DEFAULT 'api' NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_sessions" ADD COLUMN "source" varchar(20) DEFAULT 'api' NOT NULL;--> statement-breakpoint
ALTER TABLE "search_events" ADD COLUMN "source" varchar(20) DEFAULT 'api' NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_ai_usage_source" ON "ai_usage_events" USING btree ("source");--> statement-breakpoint
CREATE INDEX "idx_search_events_source" ON "search_events" USING btree ("source");