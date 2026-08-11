// src/features/ai-experience/execution-policy.test.ts

import { describe, it, expect } from 'vitest';
import {
  AUTONOMOUS_POLICY,
  GOVERNED_POLICY,
  applyToolAllowlist,
  describePolicy,
  guardrailDecision,
  resolveExecutionPolicy,
} from './execution-policy';

describe('resolveExecutionPolicy', () => {
  it('maps deterministic to the governed preset', () => {
    expect(resolveExecutionPolicy('deterministic', null)).toEqual(GOVERNED_POLICY);
  });

  it('maps agentic to the autonomous preset', () => {
    expect(resolveExecutionPolicy('agentic', null)).toEqual(AUTONOMOUS_POLICY);
  });

  it('governs a single planning round — no re-plan without opting in', () => {
    // This is the guarantee the Governed preset sells; assert it explicitly so a
    // preset edit cannot silently grant autonomy to existing experiences.
    expect(resolveExecutionPolicy('deterministic', null).maxPlanningRounds).toBe(1);
  });

  it('falls back to governed for an unknown mode', () => {
    // Safer default if a newer mode value reaches an older deployment.
    expect(resolveExecutionPolicy('quantum', null)).toEqual(GOVERNED_POLICY);
  });

  it('treats a partial policy as a delta on the preset', () => {
    const policy = resolveExecutionPolicy('agentic', { maxToolCallsPerTurn: 2 });
    expect(policy.maxToolCallsPerTurn).toBe(2);
    // Everything else still comes from the autonomous preset.
    expect(policy.maxPlanningRounds).toBe(AUTONOMOUS_POLICY.maxPlanningRounds);
    expect(policy.includePersonaInPlanning).toBe(AUTONOMOUS_POLICY.includePersonaInPlanning);
  });

  it('lets an override express autonomous-but-capped', () => {
    const policy = resolveExecutionPolicy('agentic', {
      maxToolCallsPerTurn: 3,
      allowedTools: ['catalog-search'],
    });
    expect(policy.maxPlanningRounds).toBeGreaterThan(1);
    expect(policy.maxToolCallsPerTurn).toBe(3);
    expect(policy.allowedTools).toEqual(['catalog-search']);
  });

  it('lets a governed experience opt into bounded re-planning', () => {
    const policy = resolveExecutionPolicy('deterministic', { maxPlanningRounds: 2 });
    expect(policy.maxPlanningRounds).toBe(2);
    expect(policy.maxToolCallsPerTurn).toBe(GOVERNED_POLICY.maxToolCallsPerTurn);
  });

  it('honors explicit false for includePersonaInPlanning', () => {
    // A plain `??` on a boolean would be fine, but a `||` would not — pin it.
    const policy = resolveExecutionPolicy('agentic', { includePersonaInPlanning: false });
    expect(policy.includePersonaInPlanning).toBe(false);
  });

  it('honors explicit true for includePersonaInPlanning', () => {
    const policy = resolveExecutionPolicy('deterministic', { includePersonaInPlanning: true });
    expect(policy.includePersonaInPlanning).toBe(true);
  });

  it('does not mutate the shared preset objects', () => {
    const policy = resolveExecutionPolicy('deterministic', null);
    policy.maxToolCallsPerTurn = 99;
    expect(GOVERNED_POLICY.maxToolCallsPerTurn).not.toBe(99);
  });
});

describe('describePolicy', () => {
  it('recognises each preset', () => {
    expect(describePolicy(GOVERNED_POLICY)).toBe('governed');
    expect(describePolicy(AUTONOMOUS_POLICY)).toBe('autonomous');
  });

  it('reports custom when a field diverges', () => {
    expect(describePolicy({ ...GOVERNED_POLICY, maxToolCallsPerTurn: 7 })).toBe('custom');
  });

  it('compares allowlists by value, not identity', () => {
    expect(describePolicy({ ...GOVERNED_POLICY, allowedTools: ['a'] })).toBe('custom');
    expect(describePolicy({ ...GOVERNED_POLICY, allowedTools: null })).toBe('governed');
  });
});

describe('applyToolAllowlist', () => {
  const tools = [{ slug: 'search' }, { slug: 'lookup' }, { slug: 'values' }];

  it('passes every tool through when no allowlist is set', () => {
    expect(applyToolAllowlist(tools, GOVERNED_POLICY)).toEqual(tools);
  });

  it('keeps only allowlisted tools', () => {
    const policy = { ...GOVERNED_POLICY, allowedTools: ['search', 'values'] };
    expect(applyToolAllowlist(tools, policy).map((t) => t.slug)).toEqual(['search', 'values']);
  });

  it('returns empty rather than silently falling back when nothing matches', () => {
    // A policy naming only unknown tools is a misconfiguration; surfacing it as
    // an empty list lets the caller report it instead of quietly ignoring the
    // allowlist and granting full access.
    const policy = { ...GOVERNED_POLICY, allowedTools: ['does-not-exist'] };
    expect(applyToolAllowlist(tools, policy)).toEqual([]);
  });
});

// ============================================================================
// THE PRESETS MUST STAY DISTINGUISHABLE
// ============================================================================

/**
 * Consolidating two engines into one pipeline is only safe if the presets still mean
 * different things. Nothing previously asserted that, and two of the six fields were
 * identical across both — so "Governed" and "Autonomous" could have quietly become labels
 * over the same behavior, which would remove the reason the choice is offered at all.
 */
describe('Governed vs Autonomous are meaningfully different', () => {
  it('differs on every axis a customer is asked to choose between', () => {
    // Planning autonomy: one shot versus bounded re-planning.
    expect(GOVERNED_POLICY.maxPlanningRounds).toBe(1);
    expect(AUTONOMOUS_POLICY.maxPlanningRounds).toBeGreaterThan(1);

    // Action budget.
    expect(AUTONOMOUS_POLICY.maxToolCallsPerTurn).toBeGreaterThan(GOVERNED_POLICY.maxToolCallsPerTurn);

    // Guardrail enforcement is deliberately NOT here. It is a compliance lock, not a
    // budget, and it moved to GuardrailConfig.enforced — every axis left on this object
    // meters tokens or seconds.
    expect('guardrails' in GOVERNED_POLICY).toBe(false);

    // Prompt content: the retired agentic loop put persona into planning and the
    // deterministic engine did not. Keeping that difference means the presets differ in
    // what the planner is told, not only in how often it may run.
    expect(GOVERNED_POLICY.includePersonaInPlanning).toBe(false);
    expect(AUTONOMOUS_POLICY.includePersonaInPlanning).toBe(true);
  });

  it('is recognizable from a resolved policy alone', () => {
    // What the trace records per turn, so an audit does not depend on experience config
    // that may have changed since.
    expect(describePolicy(resolveExecutionPolicy('deterministic'))).toBe('governed');
    expect(describePolicy(resolveExecutionPolicy('agentic'))).toBe('autonomous');
  });

  it('reports a hand-tuned policy as custom rather than as a preset', () => {
    const tuned = resolveExecutionPolicy('agentic', { maxToolCallsPerTurn: 4 });
    expect(describePolicy(tuned)).toBe('custom');
  });
});

// ============================================================================
// GUARDRAIL ENFORCEMENT
// ============================================================================

describe('guardrailDecision', () => {
  it('runs a stage the experience enabled, locked or not', () => {
    const stage = { enabled: true, rules: [{ type: 'blocklist' }] };
    expect(guardrailDecision(true, stage)).toEqual({ run: true, forcedByPolicy: false });
    expect(guardrailDecision(false, stage)).toEqual({ run: true, forcedByPolicy: false });
  });

  it('forces a disabled stage to run when the guardrails are locked', () => {
    // The gap this closes: an operator could disable guardrails and the turn would run
    // unguarded while still reporting itself as governed.
    const stage = { enabled: false, rules: [{ type: 'blocklist' }] };
    expect(guardrailDecision(true, stage)).toEqual({ run: true, forcedByPolicy: true });
  });

  it('honors a disabled stage when the guardrails are unlocked', () => {
    const stage = { enabled: false, rules: [{ type: 'blocklist' }] };
    expect(guardrailDecision(false, stage)).toEqual({ run: false, forcedByPolicy: false });
  });

  it('treats an absent lock as unlocked', () => {
    // `enforced` is optional on GuardrailConfig, so undefined must not read as locked.
    const stage = { enabled: false, rules: [{ type: 'blocklist' }] };
    expect(guardrailDecision(undefined, stage)).toEqual({ run: false, forcedByPolicy: false });
  });

  it('does not run a stage with no rules, even when locked', () => {
    // Rules that do not exist cannot be enforced, and an empty stage would spend latency
    // to accomplish nothing. Callers report this case as a misconfiguration instead.
    expect(guardrailDecision(true, { enabled: false, rules: [] })).toEqual({
      run: false,
      forcedByPolicy: false,
    });
    expect(guardrailDecision(true, undefined)).toEqual({
      run: false,
      forcedByPolicy: false,
    });
  });

  it('still runs an enabled stage that has no rules, since the operator asked for it', () => {
    expect(guardrailDecision(false, { enabled: true, rules: [] }).run).toBe(true);
  });
});

// ============================================================================
// PLANNER PROMPT BUDGET
// ============================================================================

describe('planner prompt budget', () => {
  it('ships the same default on both presets — cost is not a governance axis', () => {
    // Deliberately identical: how much schema the planner is told is a cost/quality trade
    // for the operator, not part of what Governed versus Autonomous means.
    expect(GOVERNED_POLICY.maxPlannerFieldsPerSource).toBe(AUTONOMOUS_POLICY.maxPlannerFieldsPerSource);
    expect(GOVERNED_POLICY.maxPlannerValuesPerField).toBe(AUTONOMOUS_POLICY.maxPlannerValuesPerField);
  });

  it('is overridable per experience', () => {
    const tuned = resolveExecutionPolicy('deterministic', { maxPlannerFieldsPerSource: 10 });

    expect(tuned.maxPlannerFieldsPerSource).toBe(10);
    // Untouched axes keep tracking the preset.
    expect(tuned.maxPlanningRounds).toBe(GOVERNED_POLICY.maxPlanningRounds);
    expect(describePolicy(tuned)).toBe('custom');
  });

  it('accepts zero, which turns the schema block off', () => {
    expect(resolveExecutionPolicy('agentic', { maxPlannerFieldsPerSource: 0 }).maxPlannerFieldsPerSource).toBe(0);
  });
});
