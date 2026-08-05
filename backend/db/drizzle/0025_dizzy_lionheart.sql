CREATE TABLE "ingestion_key_indexes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingestion_key_id" uuid NOT NULL,
	"search_index_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_ingestion_key_index" UNIQUE("ingestion_key_id","search_index_id")
);
--> statement-breakpoint
CREATE TABLE "ingestion_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"key_prefix" varchar(32) NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"operations" json DEFAULT '[]'::json NOT NULL,
	"revoked_at" timestamp,
	"expires_at" timestamp,
	"last_used_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ingestion_keys_key_prefix_unique" UNIQUE("key_prefix")
);
--> statement-breakpoint
ALTER TABLE "indexing_batches" ADD COLUMN "created_by_key_id" uuid;--> statement-breakpoint
ALTER TABLE "ingestion_key_indexes" ADD CONSTRAINT "ingestion_key_indexes_ingestion_key_id_ingestion_keys_id_fk" FOREIGN KEY ("ingestion_key_id") REFERENCES "public"."ingestion_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_key_indexes" ADD CONSTRAINT "ingestion_key_indexes_search_index_id_search_index_id_fk" FOREIGN KEY ("search_index_id") REFERENCES "public"."search_index"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingestion_key_indexes_key_id_idx" ON "ingestion_key_indexes" USING btree ("ingestion_key_id");--> statement-breakpoint
CREATE INDEX "ingestion_key_indexes_search_index_id_idx" ON "ingestion_key_indexes" USING btree ("search_index_id");--> statement-breakpoint
CREATE INDEX "ingestion_keys_key_prefix_idx" ON "ingestion_keys" USING btree ("key_prefix");--> statement-breakpoint
CREATE INDEX "ingestion_keys_revoked_at_idx" ON "ingestion_keys" USING btree ("revoked_at");--> statement-breakpoint
ALTER TABLE "indexing_batches" ADD CONSTRAINT "indexing_batches_created_by_key_id_ingestion_keys_id_fk" FOREIGN KEY ("created_by_key_id") REFERENCES "public"."ingestion_keys"("id") ON DELETE set null ON UPDATE no action;