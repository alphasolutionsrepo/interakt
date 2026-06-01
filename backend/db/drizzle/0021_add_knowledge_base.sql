-- Migration: 0021_add_knowledge_base
-- Sprint 6 (Phase E) — Domain Knowledge Base
--
-- Creates knowledge_documents and knowledge_chunks tables for file_store data sources.
-- knowledge_chunks uses pgvector (HNSW cosine index) for semantic search.

CREATE TYPE "public"."knowledge_document_status" AS ENUM('pending', 'processing', 'ready', 'failed');

CREATE TABLE "knowledge_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "data_source_id" uuid NOT NULL,
  "name" varchar(500) NOT NULL,
  "mime_type" varchar(100),
  "size_bytes" integer,
  "status" "knowledge_document_status" DEFAULT 'pending' NOT NULL,
  "chunk_count" integer DEFAULT 0 NOT NULL,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processed_at" timestamp with time zone
);

ALTER TABLE "knowledge_documents"
  ADD CONSTRAINT "knowledge_documents_data_source_id_data_sources_id_fk"
  FOREIGN KEY ("data_source_id") REFERENCES "public"."data_sources"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX "knowledge_documents_data_source_idx" ON "knowledge_documents" ("data_source_id");
CREATE INDEX "knowledge_documents_data_source_status_idx" ON "knowledge_documents" ("data_source_id", "status");

CREATE TABLE "knowledge_chunks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "document_id" uuid NOT NULL,
  "data_source_id" uuid NOT NULL,
  "chunk_index" integer NOT NULL,
  "content" text NOT NULL,
  "embedding" vector(1536),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "knowledge_chunks"
  ADD CONSTRAINT "knowledge_chunks_document_id_knowledge_documents_id_fk"
  FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "knowledge_chunks"
  ADD CONSTRAINT "knowledge_chunks_data_source_id_data_sources_id_fk"
  FOREIGN KEY ("data_source_id") REFERENCES "public"."data_sources"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX "knowledge_chunks_document_idx" ON "knowledge_chunks" ("document_id");
CREATE INDEX "knowledge_chunks_data_source_idx" ON "knowledge_chunks" ("data_source_id");
CREATE INDEX "knowledge_chunks_document_chunk_idx" ON "knowledge_chunks" ("document_id", "chunk_index");
CREATE INDEX "knowledge_chunks_embedding_idx" ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);
