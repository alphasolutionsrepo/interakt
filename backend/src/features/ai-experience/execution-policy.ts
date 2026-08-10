// src/features/ai-experience/execution-policy.ts

/**
 * Execution Policy — how much autonomy the chat engine has on a turn.
 *
 * Background: the platform used to ship two chat *engines* — a deterministic
 * pipeline and a separate agentic step pipeline — with divergent prompt
 * assembly and divergent capabilities. Identical tools and identical persona
 * instructions produced different behavior depending on which engine ran, and
 * every new capability had to be built twice or silently applied to one mode.
 *
 * The engine is now one pipeline, and "deterministic vs agentic" becomes
 * *policy* over that pipeline. This is strictly more expressive: a governed run
 * is a single planning round with a tool ceiling, an autonomous run permits
 * bounded re-planning, and anything in between ("autonomous but capped at three
 * calls, read-only tools") is now expressible where two named modes could not.
 *
 * Naming: the stored `pipelineMode` values remain `deterministic` / `agentic`
 * for API compatibility, and act as preset selectors. The user-facing labels are
 * **Standard** and **Thorough**, defined in the UI's ExperienceBadges module.
 *
 * They were briefly Governed / Autonomous, which described the two engines
 * accurately and this object badly. Once guardrail enforcement moved to
 * `GuardrailConfig.enforced`, every axis left here meters tokens or seconds —
 * so the preset decides how hard a turn tries before giving up, and nothing
 * else. "Governed" belongs to the guardrail lock, which is the only setting
 * that governs anything.
 *
 * "Deterministic" was always a promise the architecture could not keep: the
 * planner and parameter extractor are LLM calls, so identical input can yield a
 * different plan. What a bounded run guarantees is a fixed process, bounded
 * actions and a complete audit trail — not identical output.
 */

// ============================================================================
// POLICY
// ============================================================================

export interface ExecutionPolicy {
  /**
   * How many times the planner may run in a turn.
   *
   * 1 = plan once and live with it (governed). Greater than 1 permits bounded
   * re-planning when a round produces nothing usable. Every round is counted
   * and recorded on the trace, so autonomy stays auditable.
   */
  maxPlanningRounds: number;

  /** Hard ceiling on tool executions per turn, across all planning rounds. */
  maxToolCallsPerTurn: number;

  /** Tool slugs the engine may call. `null` means every tool bound to the experience. */
  allowedTools: string[] | null;

  /**
   * Whether the experience's persona instructions are included in the planning
   * prompt.
   *
   * Kept as an explicit switch because it is a product decision, not a
   * technical one: persona text governs voice, and letting it also steer tool
   * selection couples the two. It defaults to `false`, which preserves existing
   * behavior — `personaInstructions` is currently threaded into the planner
   * input and then ignored.
   */
  includePersonaInPlanning: boolean;

  /** Wall-clock ceiling for the whole turn. */
  maxTurnDurationMs: number;

  /**
   * How many fields per data source are described to the planner.
   *
   * The planner is told what the index actually contains — field capabilities, observed
   * values, how often each field is empty — and that text is in every planning call. A wide
   * crawled index can carry hundreds of fields, so the list is ranked by planning usefulness
   * and capped here, with the omission stated in the prompt.
   *
   * The trade is prompt cost against plan quality, and it belongs to the operator: a
   * 48-field catalog renders in roughly 765 tokens at 30 fields, and an autonomous turn can
   * plan more than once. Lower it to spend less; raise it when the planner is missing fields
   * it needed.
   */
  maxPlannerFieldsPerSource: number;

  /** Observed example values shown per field in that description. */
  maxPlannerValuesPerField: number;
}

// ============================================================================
// PRESETS
// ============================================================================

/**
 * Standard — a single planning round and a bounded tool budget.
 *
 * Guardrail enforcement used to live here too. It moved to `GuardrailConfig.enforced`,
 * because it was the one axis that metered nothing: everything left on this object trades
 * tokens or seconds, and a compliance lock is not a budget.
 *
 * The constant keeps its `GOVERNED_POLICY` name to match the preset key below, which is
 * recorded on every trace — renaming it would break the continuity of existing traces for a
 * cosmetic gain.
 */
export const GOVERNED_POLICY: ExecutionPolicy = {
  maxPlanningRounds: 1,
  maxToolCallsPerTurn: 3,
  allowedTools: null,
  includePersonaInPlanning: false,
  maxTurnDurationMs: 60_000,
  maxPlannerFieldsPerSource: 30,
  maxPlannerValuesPerField: 8,
};

/**
 * Thorough — bounded re-planning, a wider tool budget.
 *
 * `maxPlanningRounds: 3` matches the previous agentic loop's default of 5
 * tool-calling iterations more conservatively: a round here is a full
 * plan-and-execute pass, not a single tool call, so fewer rounds cover the same
 * ground.
 */
export const AUTONOMOUS_POLICY: ExecutionPolicy = {
  maxPlanningRounds: 3,
  maxToolCallsPerTurn: 8,
  allowedTools: null,
  // The retired agentic loop built persona instructions into its planning prompt, and the
  // deterministic engine did not — one of the divergences that made the same experience
  // behave differently depending on which engine ran. Thorough keeps that behavior;
  // Standard keeps planning template-driven, so voice text cannot steer tool selection.
  // This is also what makes the two presets differ in prompt content and not just budget.
  includePersonaInPlanning: true,
  maxTurnDurationMs: 90_000,
  maxPlannerFieldsPerSource: 30,
  maxPlannerValuesPerField: 8,
};

export const EXECUTION_POLICY_PRESETS = {
  governed: GOVERNED_POLICY,
  autonomous: AUTONOMOUS_POLICY,
} as const;

export type ExecutionPolicyPreset = keyof typeof EXECUTION_POLICY_PRESETS;

/** Stored `pipelineMode` → preset. The mode column is now a preset selector. */
const MODE_TO_PRESET: Record<string, ExecutionPolicyPreset> = {
  deterministic: 'governed',
  agentic: 'autonomous',
};

// ============================================================================
// RESOLUTION
// ============================================================================

/**
 * Resolve the effective policy for an experience.
 *
 * Precedence: an explicit `executionPolicy` overrides the preset field by
 * field, so a partial policy is a delta on the preset rather than a full
 * replacement. Unknown modes fall back to governed — the safer default if a
 * new mode value ever reaches an older deployment.
 */
export function resolveExecutionPolicy(
  pipelineMode: string,
  storedPolicy?: Partial<ExecutionPolicy> | null,
): ExecutionPolicy {
  const preset = EXECUTION_POLICY_PRESETS[MODE_TO_PRESET[pipelineMode] ?? 'governed'];
  if (!storedPolicy) return { ...preset };

  return {
    maxPlanningRounds: storedPolicy.maxPlanningRounds ?? preset.maxPlanningRounds,
    maxToolCallsPerTurn: storedPolicy.maxToolCallsPerTurn ?? preset.maxToolCallsPerTurn,
    allowedTools: storedPolicy.allowedTools ?? preset.allowedTools,
    includePersonaInPlanning:
      storedPolicy.includePersonaInPlanning ?? preset.includePersonaInPlanning,
    maxTurnDurationMs: storedPolicy.maxTurnDurationMs ?? preset.maxTurnDurationMs,
    maxPlannerFieldsPerSource:
      storedPolicy.maxPlannerFieldsPerSource ?? preset.maxPlannerFieldsPerSource,
    maxPlannerValuesPerField:
      storedPolicy.maxPlannerValuesPerField ?? preset.maxPlannerValuesPerField,
  };
}

/**
 * Which preset a resolved policy corresponds to, for display and tracing.
 * Returns 'custom' when it matches neither preset exactly.
 */
export function describePolicy(policy: ExecutionPolicy): ExecutionPolicyPreset | 'custom' {
  for (const [name, preset] of Object.entries(EXECUTION_POLICY_PRESETS)) {
    const matches = (Object.keys(preset) as Array<keyof ExecutionPolicy>).every((k) => {
      const a = preset[k];
      const b = policy[k];
      return Array.isArray(a) || Array.isArray(b)
        ? JSON.stringify(a) === JSON.stringify(b)
        : a === b;
    });
    if (matches) return name as ExecutionPolicyPreset;
  }
  return 'custom';
}

/**
 * Whether a guardrail stage should run, and whether the lock is what forced it.
 *
 * The guardrail stages used to key off the experience's own `enabled` flag alone, so an
 * operator could switch them off and a turn would run unguarded while still reporting
 * itself as governed. `GuardrailConfig.enforced` closes that: the configured rules run
 * regardless of the flag.
 *
 * `enforced` is passed in rather than read from the ExecutionPolicy because it is not a
 * budget — it is a statement about the guardrails, and it lives with them.
 *
 * Rules that do not exist cannot be enforced, so an empty rule list never runs — a stage
 * with nothing in it would burn latency to accomplish nothing. Callers report that case
 * separately, because a locked experience with no rules configured is a misconfiguration
 * rather than a lock failure.
 */
export function guardrailDecision(
  enforced: boolean | undefined,
  stage: { enabled?: boolean; rules?: unknown[] } | null | undefined,
): { run: boolean; forcedByPolicy: boolean } {
  const ruleCount = stage?.rules?.length ?? 0;
  if (stage?.enabled === true) return { run: true, forcedByPolicy: false };
  if (enforced === true && ruleCount > 0) {
    return { run: true, forcedByPolicy: true };
  }
  return { run: false, forcedByPolicy: false };
}

/**
 * Filter an experience's tools down to those the policy permits.
 * A policy naming no known tool is treated as a misconfiguration by the caller,
 * which is why this returns the filtered list rather than silently falling back.
 */
export function applyToolAllowlist<T extends { slug: string }>(
  tools: T[],
  policy: ExecutionPolicy,
): T[] {
  if (!policy.allowedTools) return tools;
  const allowed = new Set(policy.allowedTools);
  return tools.filter((t) => allowed.has(t.slug));
}
