-- Salvage the one honourable setting from the retired pipeline_config.
--
-- pipeline_config held a hand-authored step composition executed by the old
-- step-based engine. That engine is gone: the column is still written by the API
-- but nothing reads it, so a custom step list no longer has any effect.
--
-- Most of it cannot be migrated — arbitrary step ordering has no equivalent in a
-- fixed Plan-Execute-Assess-Synthesize pipeline, and inventing one would change
-- behavior rather than preserve it. But `settings.maxTotalDurationMs` maps
-- exactly onto executionPolicy.maxTurnDurationMs, so an operator who deliberately
-- tightened or relaxed their turn timeout keeps it.
--
-- The column itself is intentionally NOT dropped: it preserves the operator's
-- original intent for inspection and keeps a downgrade possible. A boot-time
-- preflight check (shared/setup/upgrade-preflight.ts) reports any experience
-- still carrying one so it is visible rather than silently ignored.

UPDATE ai_experiences
SET execution_policy = COALESCE(execution_policy::jsonb, '{}'::jsonb)
      || jsonb_build_object(
           'maxTurnDurationMs',
           (pipeline_config -> 'settings' ->> 'maxTotalDurationMs')::int
         )
WHERE pipeline_config IS NOT NULL
  -- Guard the cast: free-form JSON, so skip anything non-numeric.
  AND pipeline_config -> 'settings' ->> 'maxTotalDurationMs' ~ '^[0-9]+$'
  -- Respect the schema bounds enforced by executionPolicySchema (5s–300s).
  AND (pipeline_config -> 'settings' ->> 'maxTotalDurationMs')::int BETWEEN 5000 AND 300000
  -- Never overwrite a timeout the operator already set on the new policy.
  AND (
    execution_policy IS NULL
    OR execution_policy::jsonb -> 'maxTurnDurationMs' IS NULL
  );
