ALTER TABLE "ai_provider_models" ADD COLUMN "hidden_by_discovery" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Before this marker only Ollama had discovery, and it switched a model back on when Ollama
-- listed it again: its discovered models that are off keep coming back as before
UPDATE "ai_provider_models" SET "hidden_by_discovery" = true
WHERE "is_discovered" = true AND "is_available" = false
  AND "provider_id" IN (SELECT "id" FROM "ai_providers" WHERE "connection_type" = 'ollama');
