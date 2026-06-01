CREATE TYPE "public"."tool_type" AS ENUM('search_provider', 'http_api', 'web_search', 'ai_responder');--> statement-breakpoint
CREATE TYPE "public"."pipeline_mode" AS ENUM('agentic', 'deterministic');--> statement-breakpoint
CREATE TABLE "tools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"type" "tool_type" NOT NULL,
	"config" json NOT NULL,
	"ai_description" text NOT NULL,
	"input_schema" json,
	"output_schema" json,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tools_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"encrypted_value" text NOT NULL,
	"description" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "secrets_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "ai_experiences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"pipeline_mode" "pipeline_mode" DEFAULT 'deterministic' NOT NULL,
	"ai_config" json NOT NULL,
	"access_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"allowed_origins" json DEFAULT '[]'::json,
	"rate_limit_config" json,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "ai_experiences_slug_unique" UNIQUE("slug"),
	CONSTRAINT "ai_experiences_access_token_unique" UNIQUE("access_token")
);
--> statement-breakpoint
CREATE TABLE "ai_experience_tools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ai_experience_id" uuid NOT NULL,
	"tool_id" uuid NOT NULL,
	"override_ai_description" text,
	"override_config" json,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aet_experience_tool_unique" UNIQUE("ai_experience_id","tool_id")
);
--> statement-breakpoint
ALTER TABLE "ai_experience_tools" ADD CONSTRAINT "ai_experience_tools_ai_experience_id_ai_experiences_id_fk" FOREIGN KEY ("ai_experience_id") REFERENCES "public"."ai_experiences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_experience_tools" ADD CONSTRAINT "ai_experience_tools_tool_id_tools_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tools_slug_idx" ON "tools" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "tools_type_idx" ON "tools" USING btree ("type");--> statement-breakpoint
CREATE INDEX "tools_is_active_idx" ON "tools" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "tools_created_at_idx" ON "tools" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "secrets_name_idx" ON "secrets" USING btree ("name");--> statement-breakpoint
CREATE INDEX "ai_experiences_slug_idx" ON "ai_experiences" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "ai_experiences_access_token_idx" ON "ai_experiences" USING btree ("access_token");--> statement-breakpoint
CREATE INDEX "ai_experiences_is_active_idx" ON "ai_experiences" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "ai_experiences_created_at_idx" ON "ai_experiences" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "aet_experience_idx" ON "ai_experience_tools" USING btree ("ai_experience_id");--> statement-breakpoint
CREATE INDEX "aet_tool_idx" ON "ai_experience_tools" USING btree ("tool_id");
