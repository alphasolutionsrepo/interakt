CREATE TABLE "ai_usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"operation" varchar(20) NOT NULL,
	"provider_id" uuid NOT NULL,
	"provider_key" varchar(50) NOT NULL,
	"model_id" bigint,
	"model_key" varchar(100) NOT NULL,
	"input_tokens" integer DEFAULT 0,
	"output_tokens" integer DEFAULT 0,
	"total_tokens" integer DEFAULT 0,
	"embedding_dimensions" integer,
	"batch_size" integer,
	"duration_ms" integer NOT NULL,
	"time_to_first_token" integer,
	"success" boolean NOT NULL,
	"error_code" varchar(50),
	"error_message" text,
	"user_id" varchar(255),
	"session_id" varchar(255),
	"feature" varchar(100),
	"request_metadata" json,
	"estimated_cost_usd" real,
	"version" varchar(50) DEFAULT '1.0.0' NOT NULL,
	"environment" varchar(50) DEFAULT 'production' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_usage_events_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE "ai_usage_summary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"time_bucket" timestamp with time zone NOT NULL,
	"granularity" varchar(20) NOT NULL,
	"provider_key" varchar(50),
	"model_key" varchar(100),
	"operation" varchar(20),
	"feature" varchar(100),
	"total_requests" integer DEFAULT 0 NOT NULL,
	"successful_requests" integer DEFAULT 0 NOT NULL,
	"failed_requests" integer DEFAULT 0 NOT NULL,
	"total_input_tokens" bigint DEFAULT 0,
	"total_output_tokens" bigint DEFAULT 0,
	"total_tokens" bigint DEFAULT 0,
	"avg_input_tokens" real,
	"avg_output_tokens" real,
	"avg_duration_ms" real,
	"min_duration_ms" integer,
	"max_duration_ms" integer,
	"p95_duration_ms" integer,
	"total_estimated_cost_usd" real,
	"total_embedding_batches" integer DEFAULT 0,
	"total_texts_embedded" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_health" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"provider_key" varchar(50) NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"total_requests" integer DEFAULT 0 NOT NULL,
	"successful_requests" integer DEFAULT 0 NOT NULL,
	"failed_requests" integer DEFAULT 0 NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"circuit_state" varchar(20) DEFAULT 'closed' NOT NULL,
	"circuit_opened_at" timestamp with time zone,
	"circuit_closed_at" timestamp with time zone,
	"avg_response_time_ms" real,
	"error_rate" real,
	"last_error_code" varchar(50),
	"last_error_message" text,
	"last_error_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_ai_usage_timestamp" ON "ai_usage_events" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_ai_usage_operation" ON "ai_usage_events" USING btree ("operation");--> statement-breakpoint
CREATE INDEX "idx_ai_usage_provider_key" ON "ai_usage_events" USING btree ("provider_key");--> statement-breakpoint
CREATE INDEX "idx_ai_usage_model_key" ON "ai_usage_events" USING btree ("model_key");--> statement-breakpoint
CREATE INDEX "idx_ai_usage_user_id" ON "ai_usage_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_ai_usage_feature" ON "ai_usage_events" USING btree ("feature");--> statement-breakpoint
CREATE INDEX "idx_ai_usage_success" ON "ai_usage_events" USING btree ("success");--> statement-breakpoint
CREATE INDEX "idx_ai_usage_provider_timestamp" ON "ai_usage_events" USING btree ("provider_key","timestamp");--> statement-breakpoint
CREATE INDEX "idx_ai_usage_operation_timestamp" ON "ai_usage_events" USING btree ("operation","timestamp");--> statement-breakpoint
CREATE INDEX "idx_ai_usage_user_timestamp" ON "ai_usage_events" USING btree ("user_id","timestamp");--> statement-breakpoint
CREATE INDEX "idx_ai_summary_time_bucket" ON "ai_usage_summary" USING btree ("time_bucket");--> statement-breakpoint
CREATE INDEX "idx_ai_summary_granularity" ON "ai_usage_summary" USING btree ("granularity");--> statement-breakpoint
CREATE INDEX "idx_ai_summary_provider_key" ON "ai_usage_summary" USING btree ("provider_key");--> statement-breakpoint
CREATE INDEX "idx_ai_summary_model_key" ON "ai_usage_summary" USING btree ("model_key");--> statement-breakpoint
CREATE INDEX "idx_ai_summary_operation" ON "ai_usage_summary" USING btree ("operation");--> statement-breakpoint
CREATE INDEX "idx_ai_summary_feature" ON "ai_usage_summary" USING btree ("feature");--> statement-breakpoint
CREATE INDEX "idx_ai_summary_time_granularity" ON "ai_usage_summary" USING btree ("time_bucket","granularity");--> statement-breakpoint
CREATE INDEX "idx_ai_summary_provider_operation" ON "ai_usage_summary" USING btree ("provider_key","operation");--> statement-breakpoint
CREATE INDEX "idx_provider_health_provider_id" ON "provider_health" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "idx_provider_health_provider_key" ON "provider_health" USING btree ("provider_key");--> statement-breakpoint
CREATE INDEX "idx_provider_health_window_start" ON "provider_health" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX "idx_provider_health_circuit_state" ON "provider_health" USING btree ("circuit_state");