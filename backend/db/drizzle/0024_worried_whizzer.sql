CREATE TYPE "public"."mcp_connection_status" AS ENUM('healthy', 'degraded', 'error', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."mcp_transport" AS ENUM('streamable-http', 'sse');--> statement-breakpoint
CREATE TABLE "ai_experience_mcp_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ai_experience_id" uuid NOT NULL,
	"mcp_connection_id" uuid NOT NULL,
	"enabled_tool_names" json,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aemc_experience_connection_unique" UNIQUE("ai_experience_id","mcp_connection_id")
);
--> statement-breakpoint
CREATE TABLE "mcp_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"server_url" text NOT NULL,
	"transport" "mcp_transport" DEFAULT 'streamable-http' NOT NULL,
	"auth_config" json,
	"discovered_tools" json,
	"last_discovered_at" timestamp with time zone,
	"status" "mcp_connection_status" DEFAULT 'unknown' NOT NULL,
	"last_health_check_at" timestamp with time zone,
	"last_health_message" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_connections_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "ai_experience_mcp_connections" ADD CONSTRAINT "ai_experience_mcp_connections_ai_experience_id_ai_experiences_id_fk" FOREIGN KEY ("ai_experience_id") REFERENCES "public"."ai_experiences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_experience_mcp_connections" ADD CONSTRAINT "ai_experience_mcp_connections_mcp_connection_id_mcp_connections_id_fk" FOREIGN KEY ("mcp_connection_id") REFERENCES "public"."mcp_connections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aemc_experience_idx" ON "ai_experience_mcp_connections" USING btree ("ai_experience_id");--> statement-breakpoint
CREATE INDEX "aemc_connection_idx" ON "ai_experience_mcp_connections" USING btree ("mcp_connection_id");--> statement-breakpoint
CREATE INDEX "mcp_connections_slug_idx" ON "mcp_connections" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "mcp_connections_status_idx" ON "mcp_connections" USING btree ("status");--> statement-breakpoint
CREATE INDEX "mcp_connections_is_active_idx" ON "mcp_connections" USING btree ("is_active");