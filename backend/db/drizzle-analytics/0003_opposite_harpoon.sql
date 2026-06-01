CREATE TABLE "chat_turn_traces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trace_id" uuid NOT NULL,
	"session_id" uuid,
	"chat_session_id" varchar(255) NOT NULL,
	"experience_id" uuid NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"user_message" text NOT NULL,
	"user_message_normalized" text NOT NULL,
	"context_snapshot" json NOT NULL,
	"ai_decision_type" varchar(30) NOT NULL,
	"ai_decision" json NOT NULL,
	"tool_executed" boolean DEFAULT false,
	"tool_execution" json,
	"response_preset" varchar(50),
	"response_context_source" varchar(30),
	"ai_response" json NOT NULL,
	"duration_ms" integer NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"total_tokens" integer,
	"success" boolean NOT NULL,
	"error_code" varchar(50),
	"error_message" text,
	"metadata" json,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_turn_traces_trace_id_unique" UNIQUE("trace_id")
);
--> statement-breakpoint
CREATE INDEX "idx_chat_turn_traces_trace_id" ON "chat_turn_traces" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "idx_chat_turn_traces_chat_session" ON "chat_turn_traces" USING btree ("chat_session_id");--> statement-breakpoint
CREATE INDEX "idx_chat_turn_traces_experience" ON "chat_turn_traces" USING btree ("experience_id");--> statement-breakpoint
CREATE INDEX "idx_chat_turn_traces_timestamp" ON "chat_turn_traces" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_chat_turn_traces_decision_type" ON "chat_turn_traces" USING btree ("ai_decision_type");--> statement-breakpoint
CREATE INDEX "idx_chat_turn_traces_tool_executed" ON "chat_turn_traces" USING btree ("tool_executed");--> statement-breakpoint
CREATE INDEX "idx_chat_turn_traces_preset" ON "chat_turn_traces" USING btree ("response_preset");--> statement-breakpoint
CREATE INDEX "idx_chat_turn_traces_success" ON "chat_turn_traces" USING btree ("success");--> statement-breakpoint
CREATE INDEX "idx_chat_turn_traces_exp_time" ON "chat_turn_traces" USING btree ("experience_id","timestamp");--> statement-breakpoint
CREATE INDEX "idx_chat_turn_traces_session_time" ON "chat_turn_traces" USING btree ("chat_session_id","timestamp");