-- Move guardrail enforcement out of the execution policy and onto the guardrail config.
--
-- `executionPolicy.guardrails: 'required' | 'configured'` was the one axis on that object
-- that metered nothing. Everything else there trades tokens or seconds — planning rounds,
-- tool ceiling, turn timeout, planner prompt budget — and a compliance lock is not a
-- budget. Worse, it made the claim unreadable from the place it applies: the guardrail
-- switch in the UI said "off" while the stage ran, and nothing on that screen could say why.
--
-- It now lives at `guardrailConfig.enforced`, next to the rules it governs.
--
-- The effective value has to be *resolved* before it can be moved, because the stored
-- policy was a delta on a preset:
--
--   deterministic (governed)  -> required,   unless overridden to 'configured'
--   agentic (autonomous)      -> configured, unless overridden to 'required'
--
-- Reading only `execution_policy->>'guardrails'` would therefore lose enforcement for every
-- governed experience that never set an override — which is most of them, and exactly the
-- population that must keep it. Behavior is preserved per row, not per column.

-- 1. Carry the resolved lock onto the guardrail config.
--    Rows with no guardrail_config are skipped: there are no rules to enforce, and
--    inventing a config here would fabricate a compliance claim nobody made.
UPDATE ai_experiences
SET guardrail_config = jsonb_set(
      guardrail_config::jsonb,
      '{enforced}',
      to_jsonb(
        COALESCE(
          execution_policy -> 'guardrails' ->> 0,          -- never an array; guards odd data
          execution_policy ->> 'guardrails',
          CASE WHEN pipeline_mode = 'deterministic' THEN 'required' ELSE 'configured' END
        ) = 'required'
      ),
      true
    )::json
WHERE guardrail_config IS NOT NULL;

--> statement-breakpoint

-- 2. Drop the retired axis so the policy object contains only budget.
--    Left behind it would be dead config that still reads as authoritative — the same trap
--    pipeline_config set, which is why a boot-time preflight now reports that one.
UPDATE ai_experiences
SET execution_policy = NULLIF(
      (execution_policy::jsonb - 'guardrails'),
      '{}'::jsonb
    )::json
WHERE execution_policy IS NOT NULL
  AND execution_policy::jsonb ? 'guardrails';
