ALTER TABLE "search_experiences" ADD COLUMN "telemetry_detail_level" text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_experiences" ADD COLUMN "telemetry_detail_level" text DEFAULT 'off' NOT NULL;--> statement-breakpoint
CREATE INDEX "search_experiences_telemetry_detail_level_idx" ON "search_experiences" USING btree ("telemetry_detail_level");--> statement-breakpoint
CREATE INDEX "ai_experiences_telemetry_detail_level_idx" ON "ai_experiences" USING btree ("telemetry_detail_level");