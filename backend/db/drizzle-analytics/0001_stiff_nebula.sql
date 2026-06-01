CREATE TABLE "ai_tool_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ai_request_id" uuid NOT NULL,
	"session_id" uuid,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"tool_name" varchar(100) NOT NULL,
	"tool_category" varchar(50) NOT NULL,
	"tool_version" varchar(20) DEFAULT '1.0',
	"input_summary" json,
	"output_summary" json,
	"duration_ms" integer NOT NULL,
	"success" boolean NOT NULL,
	"error_code" varchar(50),
	"error_message" text,
	"search_event_id" uuid,
	"action_event_id" uuid,
	"metadata" json,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_session_id" varchar(255) NOT NULL,
	"experience_id" uuid,
	"experience_slug" varchar(255),
	"session_type" varchar(20) DEFAULT 'search_only' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"origin_domain" varchar(255),
	"user_agent" text,
	"ip_hash" varchar(64),
	"total_searches" integer DEFAULT 0,
	"total_ai_requests" integer DEFAULT 0,
	"total_tool_executions" integer DEFAULT 0,
	"outcome_achieved" boolean DEFAULT false,
	"outcome_type" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_session_analytics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_session_id" varchar(255) NOT NULL,
	"analytics_session_id" uuid,
	"experience_id" uuid,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" varchar(20),
	"duration_seconds" integer,
	"total_messages" integer DEFAULT 0,
	"user_messages_count" integer DEFAULT 0,
	"assistant_messages_count" integer DEFAULT 0,
	"avg_user_message_length" real,
	"avg_response_time_ms" real,
	"total_tool_calls" integer DEFAULT 0,
	"unique_tools_used" json,
	"tool_calls_breakdown" json,
	"total_tokens_used" integer DEFAULT 0,
	"total_input_tokens" integer DEFAULT 0,
	"total_output_tokens" integer DEFAULT 0,
	"estimated_cost_usd" real,
	"searches_performed" integer DEFAULT 0,
	"actions_completed" integer DEFAULT 0,
	"outcome_achieved" boolean DEFAULT false,
	"outcome_type" varchar(50),
	"metadata" json,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_session_analytics_chat_session_id_unique" UNIQUE("chat_session_id")
);
--> statement-breakpoint
CREATE TABLE "popular_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"experience_id" uuid,
	"query_normalized" text NOT NULL,
	"search_count" integer NOT NULL,
	"zero_result_count" integer DEFAULT 0,
	"avg_results_count" real,
	"click_through_rate" real,
	"trend_direction" varchar(10),
	"trend_percent" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unique_popular_query" UNIQUE("date","experience_id","query_normalized")
);
--> statement-breakpoint
CREATE TABLE "search_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"session_id" uuid,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"trigger_type" varchar(20) NOT NULL,
	"trigger_source_id" varchar(255),
	"ai_request_id" uuid,
	"search_type" varchar(20) NOT NULL,
	"index_ids" json NOT NULL,
	"experience_id" uuid,
	"experience_slug" varchar(255),
	"query_text" text NOT NULL,
	"query_normalized" text NOT NULL,
	"query_length" integer NOT NULL,
	"query_word_count" integer NOT NULL,
	"query_language" varchar(10),
	"has_filters" boolean DEFAULT false,
	"filter_fields" json,
	"filter_count" integer DEFAULT 0,
	"facets_requested" json,
	"total_results" integer NOT NULL,
	"results_returned" integer NOT NULL,
	"page_number" integer DEFAULT 1,
	"is_zero_result" boolean DEFAULT false,
	"top_result_score" real,
	"duration_ms" integer NOT NULL,
	"es_took_ms" integer,
	"embedding_duration_ms" integer,
	"success" boolean NOT NULL,
	"error_code" varchar(50),
	"error_message" text,
	"metadata" json,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_result_clicks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"search_event_id" uuid NOT NULL,
	"session_id" uuid,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"result_position" integer NOT NULL,
	"document_id" varchar(255) NOT NULL,
	"interaction_type" varchar(20) NOT NULL,
	"dwell_time_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_summary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"time_bucket" timestamp with time zone NOT NULL,
	"granularity" varchar(20) NOT NULL,
	"experience_id" uuid,
	"index_id" uuid,
	"search_type" varchar(20),
	"trigger_type" varchar(20),
	"total_searches" integer DEFAULT 0 NOT NULL,
	"unique_queries" integer DEFAULT 0,
	"zero_result_count" integer DEFAULT 0,
	"zero_result_rate" real,
	"avg_duration_ms" real,
	"p50_duration_ms" integer,
	"p95_duration_ms" integer,
	"p99_duration_ms" integer,
	"avg_results_count" real,
	"searches_with_filters" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unique_search_summary" UNIQUE("time_bucket","granularity","experience_id","index_id","search_type","trigger_type")
);
--> statement-breakpoint
CREATE TABLE "zero_result_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query_normalized" text NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"occurrence_count" integer DEFAULT 1 NOT NULL,
	"experience_ids" json,
	"sample_queries" json,
	"status" varchar(20) DEFAULT 'unreviewed',
	"notes" text,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zero_result_queries_query_normalized_unique" UNIQUE("query_normalized")
);
--> statement-breakpoint
CREATE INDEX "idx_tool_exec_ai_request" ON "ai_tool_executions" USING btree ("ai_request_id");--> statement-breakpoint
CREATE INDEX "idx_tool_exec_session" ON "ai_tool_executions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_tool_exec_timestamp" ON "ai_tool_executions" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_tool_exec_tool_name" ON "ai_tool_executions" USING btree ("tool_name");--> statement-breakpoint
CREATE INDEX "idx_tool_exec_category" ON "ai_tool_executions" USING btree ("tool_category");--> statement-breakpoint
CREATE INDEX "idx_tool_exec_search_event" ON "ai_tool_executions" USING btree ("search_event_id");--> statement-breakpoint
CREATE INDEX "idx_analytics_sessions_external" ON "analytics_sessions" USING btree ("external_session_id");--> statement-breakpoint
CREATE INDEX "idx_analytics_sessions_experience" ON "analytics_sessions" USING btree ("experience_id");--> statement-breakpoint
CREATE INDEX "idx_analytics_sessions_started" ON "analytics_sessions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_analytics_sessions_type" ON "analytics_sessions" USING btree ("session_type");--> statement-breakpoint
CREATE INDEX "idx_analytics_sessions_last_activity" ON "analytics_sessions" USING btree ("last_activity_at");--> statement-breakpoint
CREATE INDEX "idx_chat_analytics_chat_session" ON "chat_session_analytics" USING btree ("chat_session_id");--> statement-breakpoint
CREATE INDEX "idx_chat_analytics_analytics_session" ON "chat_session_analytics" USING btree ("analytics_session_id");--> statement-breakpoint
CREATE INDEX "idx_chat_analytics_experience" ON "chat_session_analytics" USING btree ("experience_id");--> statement-breakpoint
CREATE INDEX "idx_chat_analytics_started" ON "chat_session_analytics" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_chat_analytics_end_reason" ON "chat_session_analytics" USING btree ("end_reason");--> statement-breakpoint
CREATE INDEX "idx_popular_queries_date" ON "popular_queries" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_popular_queries_experience" ON "popular_queries" USING btree ("experience_id");--> statement-breakpoint
CREATE INDEX "idx_popular_queries_count" ON "popular_queries" USING btree ("search_count");--> statement-breakpoint
CREATE INDEX "idx_popular_queries_date_experience" ON "popular_queries" USING btree ("date","experience_id");--> statement-breakpoint
CREATE INDEX "idx_search_events_timestamp" ON "search_events" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_search_events_session" ON "search_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_search_events_trigger" ON "search_events" USING btree ("trigger_type");--> statement-breakpoint
CREATE INDEX "idx_search_events_search_type" ON "search_events" USING btree ("search_type");--> statement-breakpoint
CREATE INDEX "idx_search_events_experience" ON "search_events" USING btree ("experience_id");--> statement-breakpoint
CREATE INDEX "idx_search_events_zero_result" ON "search_events" USING btree ("is_zero_result");--> statement-breakpoint
CREATE INDEX "idx_search_events_query_normalized" ON "search_events" USING btree ("query_normalized");--> statement-breakpoint
CREATE INDEX "idx_search_events_timestamp_trigger" ON "search_events" USING btree ("timestamp","trigger_type");--> statement-breakpoint
CREATE INDEX "idx_search_events_experience_timestamp" ON "search_events" USING btree ("experience_id","timestamp");--> statement-breakpoint
CREATE INDEX "idx_clicks_search_event" ON "search_result_clicks" USING btree ("search_event_id");--> statement-breakpoint
CREATE INDEX "idx_clicks_session" ON "search_result_clicks" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_clicks_timestamp" ON "search_result_clicks" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_clicks_document" ON "search_result_clicks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "idx_search_summary_time_bucket" ON "search_summary" USING btree ("time_bucket");--> statement-breakpoint
CREATE INDEX "idx_search_summary_granularity" ON "search_summary" USING btree ("granularity");--> statement-breakpoint
CREATE INDEX "idx_search_summary_experience" ON "search_summary" USING btree ("experience_id");--> statement-breakpoint
CREATE INDEX "idx_search_summary_search_type" ON "search_summary" USING btree ("search_type");--> statement-breakpoint
CREATE INDEX "idx_search_summary_trigger_type" ON "search_summary" USING btree ("trigger_type");--> statement-breakpoint
CREATE INDEX "idx_search_summary_time_gran" ON "search_summary" USING btree ("time_bucket","granularity");--> statement-breakpoint
CREATE INDEX "idx_zero_result_status" ON "zero_result_queries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_zero_result_occurrence" ON "zero_result_queries" USING btree ("occurrence_count");--> statement-breakpoint
CREATE INDEX "idx_zero_result_last_seen" ON "zero_result_queries" USING btree ("last_seen_at");