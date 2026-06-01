CREATE TYPE "public"."prompt_template_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."prompt_template_step" AS ENUM('turn_planner', 'param_extraction', 'response_synthesis', 'response_synthesis_direct', 'response_synthesis_lightweight', 'agentic_loop');--> statement-breakpoint
CREATE TABLE "ai_experience_prompt_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ai_experience_id" uuid NOT NULL,
	"step" "prompt_template_step" NOT NULL,
	"template_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "aepo_experience_step_unique" UNIQUE("ai_experience_id","step")
);
--> statement-breakpoint
CREATE TABLE "prompt_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"step" "prompt_template_step" NOT NULL,
	"version" integer NOT NULL,
	"parent_id" uuid,
	"label" varchar(255),
	"content" text NOT NULL,
	"metadata" json NOT NULL,
	"status" "prompt_template_status" DEFAULT 'active' NOT NULL,
	"is_system_default" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "ai_experience_prompt_overrides" ADD CONSTRAINT "ai_experience_prompt_overrides_ai_experience_id_ai_experiences_id_fk" FOREIGN KEY ("ai_experience_id") REFERENCES "public"."ai_experiences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_experience_prompt_overrides" ADD CONSTRAINT "ai_experience_prompt_overrides_template_id_prompt_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."prompt_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aepo_experience_idx" ON "ai_experience_prompt_overrides" USING btree ("ai_experience_id");--> statement-breakpoint
CREATE INDEX "aepo_template_idx" ON "ai_experience_prompt_overrides" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "pt_step_version_idx" ON "prompt_templates" USING btree ("step","version");--> statement-breakpoint
CREATE INDEX "pt_step_status_idx" ON "prompt_templates" USING btree ("step","status");--> statement-breakpoint
CREATE INDEX "pt_parent_idx" ON "prompt_templates" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "pt_created_at_idx" ON "prompt_templates" USING btree ("created_at");