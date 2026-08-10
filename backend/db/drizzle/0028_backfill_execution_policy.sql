-- Backfill execution_policy from the retired agentic_config.
--
-- Context: chat used to run on two engines. The agentic engine's loop was bounded
-- by agenticConfig.maxIterations — one iteration being one LLM call plus one tool
-- call, with the result fed back before the next decision. The unified engine is
-- bounded by two separate axes instead: maxPlanningRounds (how many times it may
-- re-plan) and maxToolCallsPerTurn (the total tool budget across all rounds).
--
-- The units are not interchangeable, so a naive maxIterations -> maxPlanningRounds
-- copy would *grant* autonomy: each planning round can execute up to the batch
-- size (3) tools, so maxIterations=5 would become 15 tool calls. The mapping below
-- preserves the tool budget faithfully and caps re-planning conservatively:
--
--   maxToolCallsPerTurn = maxIterations             -- same total budget as before
--   maxPlanningRounds   = LEAST(maxIterations, 3)   -- never above the preset
--
-- Only rows with a usable maxIterations are touched, and any experience that
-- already has an execution_policy is left alone: an explicit policy set by an
-- operator outranks a value inferred from deprecated config.

UPDATE ai_experiences
SET execution_policy = json_build_object(
      'maxToolCallsPerTurn', (agentic_config ->> 'maxIterations')::int,
      'maxPlanningRounds', LEAST((agentic_config ->> 'maxIterations')::int, 3)
    )
WHERE execution_policy IS NULL
  AND agentic_config IS NOT NULL
  -- Guard the cast: this column is free-form JSON, so a non-numeric or absent
  -- maxIterations must be skipped rather than abort the migration.
  AND agentic_config ->> 'maxIterations' ~ '^[0-9]+$'
  AND (agentic_config ->> 'maxIterations')::int >= 1;
