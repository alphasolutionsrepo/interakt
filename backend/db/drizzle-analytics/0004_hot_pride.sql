CREATE TABLE "otel_spans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trace_id" varchar(32) NOT NULL,
	"span_id" varchar(16) NOT NULL,
	"parent_span_id" varchar(16),
	"operation_name" varchar(255) NOT NULL,
	"service_name" varchar(100) NOT NULL,
	"span_kind" varchar(20) DEFAULT 'INTERNAL' NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"duration_ms" integer NOT NULL,
	"status_code" varchar(10) DEFAULT 'UNSET' NOT NULL,
	"status_message" text,
	"experience_id" uuid,
	"experience_type" varchar(20),
	"pipeline_type" varchar(30),
	"request_id" uuid,
	"session_id" varchar(255),
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_otel_spans_trace_id" ON "otel_spans" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "idx_otel_spans_parent" ON "otel_spans" USING btree ("parent_span_id");--> statement-breakpoint
CREATE INDEX "idx_otel_spans_operation" ON "otel_spans" USING btree ("operation_name");--> statement-breakpoint
CREATE INDEX "idx_otel_spans_start_time" ON "otel_spans" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "idx_otel_spans_experience" ON "otel_spans" USING btree ("experience_id");--> statement-breakpoint
CREATE INDEX "idx_otel_spans_experience_type" ON "otel_spans" USING btree ("experience_type");--> statement-breakpoint
CREATE INDEX "idx_otel_spans_pipeline" ON "otel_spans" USING btree ("pipeline_type");--> statement-breakpoint
CREATE INDEX "idx_otel_spans_request" ON "otel_spans" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "idx_otel_spans_status" ON "otel_spans" USING btree ("status_code");--> statement-breakpoint
CREATE INDEX "idx_otel_spans_duration" ON "otel_spans" USING btree ("duration_ms");--> statement-breakpoint
CREATE INDEX "idx_otel_spans_trace_start" ON "otel_spans" USING btree ("trace_id","start_time");--> statement-breakpoint
CREATE INDEX "idx_otel_spans_exp_time" ON "otel_spans" USING btree ("experience_id","start_time");