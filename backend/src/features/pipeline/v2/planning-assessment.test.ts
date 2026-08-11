// src/features/pipeline/v2/planning-assessment.test.ts

import { describe, it, expect } from 'vitest';
import { assessRound, mergeRounds } from './planning-assessment';
import type { ActionResult, ExecutionLoopResult } from './v2.types';

function action(
  overrides: {
    data?: unknown;
    success?: boolean;
    error?: string;
    resultCount?: number;
    toolSlug?: string;
    intent?: string;
    constraintsRelaxed?: boolean;
  } = {},
): ActionResult {
  const { data, success, error, resultCount, ...rest } = overrides;
  return {
    toolSlug: 'catalog-search',
    toolId: 'tool-1',
    toolName: 'Catalog Search',
    intent: 'find jackets',
    parameters: { query: 'jackets' },
    durationMs: 12,
    ...rest,
    result: {
      success: success ?? true,
      data: data ?? { results: [{ id: '1' }, { id: '2' }] },
      ...(error ? { error } : {}),
      ...(resultCount !== undefined ? { resultCount } : {}),
    },
  } as ActionResult;
}

function round(executedActions: ActionResult[], overrides: Partial<ExecutionLoopResult> = {}): ExecutionLoopResult {
  return {
    executedActions,
    remainingActions: [],
    aborted: false,
    summary: 'executed',
    ...overrides,
  };
}

describe('assessRound', () => {
  it('is usable when an action returned results', () => {
    const a = assessRound(round([action()]), 2);
    expect(a.verdict).toBe('usable');
    expect(a.shouldReplan).toBe(false);
    expect(a.resultCount).toBe(2);
  });

  it('counts a bare array payload', () => {
    const a = assessRound(round([action({ data: [{ id: 'x' }, { id: 'y' }, { id: 'z' }] })]), 1);
    expect(a.resultCount).toBe(3);
  });

  it('counts items/values/documents payload shapes', () => {
    expect(assessRound(round([action({ data: { items: [1, 2] } })]), 1).resultCount).toBe(2);
    expect(assessRound(round([action({ data: { values: [1] } })]), 1).resultCount).toBe(1);
    expect(assessRound(round([action({ data: { documents: [1, 2, 3] } })]), 1).resultCount).toBe(3);
  });

  it('reads found:false as no result rather than one', () => {
    // A lookup miss must not read as a usable result and suppress re-planning.
    const a = assessRound(round([action({ data: { found: false, id: 'missing' } })]), 1);
    expect(a.verdict).toBe('empty');
    expect(a.resultCount).toBe(0);
  });

  it('reads found:true as one result', () => {
    const a = assessRound(round([action({ data: { found: true, id: 'x', data: {} } })]), 1);
    expect(a.verdict).toBe('usable');
    expect(a.resultCount).toBe(1);
  });

  it('prefers the returned array over resultCount', () => {
    // Some callers set resultCount to the index-wide total, not what came back.
    const a = assessRound(
      round([action({ data: { results: [{ id: '1' }], totalCount: 3515 }, resultCount: 3515 })]),
      1,
    );
    expect(a.resultCount).toBe(1);
  });

  it('re-plans when everything succeeded but returned nothing', () => {
    const a = assessRound(round([action({ data: { results: [] } })]), 2);
    expect(a.verdict).toBe('empty');
    expect(a.shouldReplan).toBe(true);
    expect(a.reason).toContain('no results');
  });

  it('re-plans when every action failed, and surfaces the first error', () => {
    const failed = action({ success: false, data: null, error: 'HTTP 400: bad filter' });
    const a = assessRound(round([failed]), 1);
    expect(a.verdict).toBe('failed');
    expect(a.shouldReplan).toBe(true);
    expect(a.reason).toContain('HTTP 400');
  });

  it('is usable when only some actions failed', () => {
    const failed = action({ success: false, data: null, error: 'nope' });
    const a = assessRound(round([failed, action()]), 1);
    expect(a.verdict).toBe('usable');
    expect(a.resultCount).toBe(2);
  });

  it('never re-plans once the budget is spent', () => {
    // Budget lives with the decision so the orchestrator cannot re-derive it wrongly.
    const a = assessRound(round([action({ data: { results: [] } })]), 0);
    expect(a.verdict).toBe('empty');
    expect(a.shouldReplan).toBe(false);
  });

  it('does not re-plan when nothing executed', () => {
    // An empty plan or an exhausted batch is not a bad tool choice, so another
    // planning round would just burn budget.
    const a = assessRound(round([]), 3);
    expect(a.verdict).toBe('nothing_executed');
    expect(a.shouldReplan).toBe(false);
  });

  it('does not re-plan a round that succeeded with data it cannot use', () => {
    // Documents the deliberate limit: this assessment judges shape, not semantic
    // fit. An enumerate call that returns 187 author names when the user asked
    // who writes about a topic reads as usable here. Catching that needs a
    // synthesis-side signal and is out of scope for this step.
    const enumerated = action({
      toolSlug: 'catalog-values',
      intent: 'list authors',
      data: { field: 'author', values: Array.from({ length: 187 }, (_, i) => ({ value: `a${i}` })) },
    });
    const a = assessRound(round([enumerated]), 2);
    expect(a.verdict).toBe('usable');
    expect(a.shouldReplan).toBe(false);
  });
});

describe('mergeRounds', () => {
  it('returns an empty result for no rounds', () => {
    const merged = mergeRounds([]);
    expect(merged.executedActions).toEqual([]);
    expect(merged.aborted).toBe(false);
  });

  it('passes a single round through unchanged', () => {
    const only = round([action()]);
    expect(mergeRounds([only])).toBe(only);
  });

  it('accumulates actions across rounds so synthesis sees every attempt', () => {
    const first = round([action({ intent: 'attempt one', data: { results: [] } })]);
    const second = round([action({ intent: 'attempt two' })]);
    const merged = mergeRounds([first, second]);
    expect(merged.executedActions).toHaveLength(2);
    expect(merged.executedActions.map((a) => a.intent)).toEqual(['attempt one', 'attempt two']);
  });

  it('takes remainingActions from the final round only', () => {
    // Earlier leftovers belong to a strategy that was abandoned; suggesting them
    // would point the user back at what already failed.
    const stale = { toolSlug: 'old', intent: 'stale', hints: {}, dependsOnPrevious: false };
    const fresh = { toolSlug: 'new', intent: 'fresh', hints: {}, dependsOnPrevious: false };
    const merged = mergeRounds([
      round([action()], { remainingActions: [stale] }),
      round([action()], { remainingActions: [fresh] }),
    ]);
    expect(merged.remainingActions).toEqual([fresh]);
  });

  it('propagates abort from any round', () => {
    const merged = mergeRounds([round([action()], { aborted: true }), round([action()])]);
    expect(merged.aborted).toBe(true);
  });

  it('labels each round in the summary', () => {
    const merged = mergeRounds([
      round([action()], { summary: 'nothing found' }),
      round([action()], { summary: '2 results' }),
    ]);
    expect(merged.summary).toBe('Round 1: nothing found | Round 2: 2 results');
  });
});

describe('constraint relaxation', () => {
  it('flags results that were only found after widening the request', () => {
    // This is what previously made an empty round look successful: filter
    // relaxation turned 0 results into many, and nothing recorded the swap.
    const a = assessRound(round([action({ constraintsRelaxed: true })]), 2);
    expect(a.verdict).toBe('usable');
    expect(a.constraintsRelaxed).toBe(true);
    expect(a.reason).toContain('constraints were relaxed');
    expect(a.reason).toContain('catalog-search');
  });

  it('does not re-plan on relaxed results', () => {
    // Relaxed results are usually the best answer available; re-planning would
    // spend budget to arrive back at the same place.
    expect(assessRound(round([action({ constraintsRelaxed: true })]), 3).shouldReplan).toBe(false);
  });

  it('says nothing about relaxation when none happened', () => {
    const a = assessRound(round([action()]), 2);
    expect(a.constraintsRelaxed).toBeUndefined();
    expect(a.reason).not.toContain('relaxed');
  });
});
