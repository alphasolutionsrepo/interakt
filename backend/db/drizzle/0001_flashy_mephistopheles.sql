CREATE TABLE "indexing_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"search_index_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"total_documents" integer DEFAULT 0 NOT NULL,
	"processed_documents" integer DEFAULT 0 NOT NULL,
	"indexed_documents" integer DEFAULT 0 NOT NULL,
	"failed_documents" integer DEFAULT 0 NOT NULL,
	"errors" json DEFAULT '[]'::json,
	"error_message" text,
	"source_file_name" varchar(255),
	"source_size_bytes" integer,
	"started_at" timestamp,
	"completed_at" timestamp,
	"duration_ms" integer,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "indexing_batches" ADD CONSTRAINT "indexing_batches_search_index_id_search_index_id_fk" FOREIGN KEY ("search_index_id") REFERENCES "public"."search_index"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "indexing_batches_search_index_id_idx" ON "indexing_batches" USING btree ("search_index_id");--> statement-breakpoint
CREATE INDEX "indexing_batches_status_idx" ON "indexing_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "indexing_batches_created_at_idx" ON "indexing_batches" USING btree ("created_at");