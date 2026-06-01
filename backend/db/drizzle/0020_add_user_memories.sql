-- Migration: 0020_add_user_memories
-- Sprint 5 (Phase D) — Episodic Memory
--
-- Creates the user_memories table for cross-session, per-user memory storage.
-- Uses pgvector for semantic retrieval (same 1536-dim embedding as ai_session_messages).

CREATE TABLE "user_memories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar(255) NOT NULL,
  "ai_experience_id" uuid NOT NULL,
  "content" text NOT NULL,
  "embedding" vector(1536),
  "confidence" real DEFAULT 1.0 NOT NULL,
  "source_session_id" uuid,
  "retrieval_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_retrieved_at" timestamp with time zone
);

ALTER TABLE "user_memories"
  ADD CONSTRAINT "user_memories_ai_experience_id_ai_experiences_id_fk"
  FOREIGN KEY ("ai_experience_id") REFERENCES "public"."ai_experiences"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "user_memories"
  ADD CONSTRAINT "user_memories_source_session_id_ai_sessions_id_fk"
  FOREIGN KEY ("source_session_id") REFERENCES "public"."ai_sessions"("id") ON DELETE set null ON UPDATE no action;

-- Standard indexes
CREATE INDEX "user_memories_user_experience_idx" ON "user_memories" ("user_id", "ai_experience_id");
CREATE INDEX "user_memories_source_session_idx" ON "user_memories" ("source_session_id");

-- pgvector HNSW index for cosine similarity search
CREATE INDEX "user_memories_embedding_idx" ON "user_memories" USING hnsw ("embedding" vector_cosine_ops);
