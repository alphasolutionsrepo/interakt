CREATE TABLE "analytics_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experience_id" uuid,
	"insight_type" varchar(30) NOT NULL,
	"time_range" varchar(10) NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"spans_processed" integer DEFAULT 0 NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processing_duration_ms" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "uq_insights_scope" UNIQUE("experience_id","insight_type","time_range")
);
--> statement-breakpoint
CREATE TABLE "analytics_processing_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" varchar(20) DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"experience_id" uuid,
	"time_ranges" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"triggered_by" varchar(255)
);
--> statement-breakpoint
DROP TABLE "chat_turn_traces" CASCADE;--> statement-breakpoint
CREATE INDEX "idx_insights_type_range" ON "analytics_insights" USING btree ("insight_type","time_range");--> statement-breakpoint
CREATE INDEX "idx_insights_experience" ON "analytics_insights" USING btree ("experience_id");--> statement-breakpoint
CREATE INDEX "idx_insights_processed_at" ON "analytics_insights" USING btree ("processed_at");--> statement-breakpoint
CREATE INDEX "idx_processing_runs_started" ON "analytics_processing_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_processing_runs_status" ON "analytics_processing_runs" USING btree ("status");