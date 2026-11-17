ALTER TABLE "ai_provider_models" ADD COLUMN "hidden_by_discovery" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Before this marker only Ollama had discovery: it hid any model Ollama didn't list (seeded ones
-- too) and switched it back on when listed again. Its models that are off keep doing so
UPDATE "ai_provider_models" SET "hidden_by_discovery" = true
WHERE "is_available" = false
  AND "provider_id" IN (SELECT "id" FROM "ai_providers" WHERE "connection_type" = 'ollama');
