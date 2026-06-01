CREATE TABLE "chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"search_experience_id" uuid NOT NULL,
	"messages" json DEFAULT '[]'::json NOT NULL,
	"initial_context" json,
	"conversation_context" json DEFAULT '{"referencedDocuments":[],"recentSearches":[]}'::json NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"client_metadata" json,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_experience_indexes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"search_experience_id" uuid NOT NULL,
	"search_index_id" uuid NOT NULL,
	"role" varchar(20) DEFAULT 'primary' NOT NULL,
	"weight" real DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"ai_description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "se_indexes_unique" UNIQUE("search_experience_id","search_index_id")
);
--> statement-breakpoint
CREATE TABLE "search_experiences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"search_config" json NOT NULL,
	"ai_config" json NOT NULL,
	"tools_config" json NOT NULL,
	"access_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"allowed_origins" json DEFAULT '[]'::json,
	"rate_limit_config" json,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "search_experiences_slug_unique" UNIQUE("slug"),
	CONSTRAINT "search_experiences_access_token_unique" UNIQUE("access_token")
);
--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_search_experience_id_search_experiences_id_fk" FOREIGN KEY ("search_experience_id") REFERENCES "public"."search_experiences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_experience_indexes" ADD CONSTRAINT "search_experience_indexes_search_experience_id_search_experiences_id_fk" FOREIGN KEY ("search_experience_id") REFERENCES "public"."search_experiences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_experience_indexes" ADD CONSTRAINT "search_experience_indexes_search_index_id_search_index_id_fk" FOREIGN KEY ("search_index_id") REFERENCES "public"."search_index"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_sessions_experience_idx" ON "chat_sessions" USING btree ("search_experience_id");--> statement-breakpoint
CREATE INDEX "chat_sessions_last_active_idx" ON "chat_sessions" USING btree ("last_active_at");--> statement-breakpoint
CREATE INDEX "chat_sessions_expires_at_idx" ON "chat_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "se_indexes_experience_idx" ON "search_experience_indexes" USING btree ("search_experience_id");--> statement-breakpoint
CREATE INDEX "se_indexes_search_index_idx" ON "search_experience_indexes" USING btree ("search_index_id");--> statement-breakpoint
CREATE INDEX "search_experiences_slug_idx" ON "search_experiences" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "search_experiences_access_token_idx" ON "search_experiences" USING btree ("access_token");--> statement-breakpoint
CREATE INDEX "search_experiences_is_active_idx" ON "search_experiences" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "search_experiences_created_by_idx" ON "search_experiences" USING btree ("created_by");