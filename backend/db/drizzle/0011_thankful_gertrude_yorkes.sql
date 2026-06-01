CREATE TABLE "domain_knowledge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"search_index_id" uuid NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"tags" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "search_index" ADD COLUMN "search_provider" varchar(30) DEFAULT 'elasticsearch' NOT NULL;--> statement-breakpoint
ALTER TABLE "domain_knowledge" ADD CONSTRAINT "domain_knowledge_search_index_id_search_index_id_fk" FOREIGN KEY ("search_index_id") REFERENCES "public"."search_index"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "domain_knowledge_search_index_idx" ON "domain_knowledge" USING btree ("search_index_id");--> statement-breakpoint
CREATE INDEX "domain_knowledge_is_active_idx" ON "domain_knowledge" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "domain_knowledge_search_index_active_idx" ON "domain_knowledge" USING btree ("search_index_id","is_active");