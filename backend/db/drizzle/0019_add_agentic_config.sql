-- Migration: Add agenticConfig column to ai_experiences
-- Stores agentic loop runtime settings (maxIterations, enablePlanning).
-- Nullable — existing experiences use the hardcoded default (maxIterations=5).

ALTER TABLE "ai_experiences" ADD COLUMN "agentic_config" json;
