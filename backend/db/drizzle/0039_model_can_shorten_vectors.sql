ALTER TABLE "ai_provider_models" ADD COLUMN "can_shorten_vectors" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Existing embedding models of the families checked to honour a requested size start marked,
-- so an upgrade does not change how they work. Keep this list in step with
-- src/features/ai-providers/shortenable-embeddings.ts. The name is the model key without a
-- registry path or vendor prefix ("library/qwen3-embedding:4b").
UPDATE "ai_provider_models" SET "can_shorten_vectors" = true
WHERE "model_type" = 'embedding'
  AND regexp_replace(lower("model_key"), '^.*/', '') ~ '^(qwen3-embedding(:|$)|nomic-embed-text(:|$)|text-embedding-3-)';
