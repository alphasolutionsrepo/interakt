// src/features/pipeline/v2/planning-assessment.ts

/**
 * Planning Assessment — decide whether a plan-and-execute round produced
 * anything the response can actually be built from.
 *
 * This is what makes bounded re-planning possible. Previously a plan was made
 * once, before any results existed, and the only recovery was progressive filter
 * relaxation inside a single search action (zero-result-retry.step.ts). If the
 * *plan itself* was wrong there was no mechanism to notice, so the turn ended
 * with a confident "I couldn't find anything" for a question the index could
 * answer.
 *
 * Deliberately conservative: this judges the *shape* of the outcome, not its
 * semantic fit. It catches "every tool failed" and "nothing came back", which
 * are unambiguous. It does NOT catch a plan that succeeded and returned data
 * that cannot answer the question — e.g. enumerating every author when asked who
 * writes about a topic. Detecting that needs a signal from synthesis and is a
 * separate piece of work; pretending otherwise here would make re-planning fire
 * on healthy turns and burn the budget.
 */

import type { ActionResult, ExecutionLoopResult } from './v2.types';

// ============================================================================
// TYPES
// ============================================================================

export type AssessmentVerdict =
  /** At least one action produced results — build the response from it. */
  | 'usable'
  /** Actions ran but every one returned nothing. Re-planning may help. */
  | 'empty'
  /** Every action failed outright (tool error, bad config, provider rejection). */
  | 'failed'
  /** Nothing ran — no actions planned, or the batch limit consumed them all. */
  | 'nothing_executed';

export interface RoundAssessment {
  verdict: AssessmentVerdict;
  /**
   * True when results were only found after widening the request. The round is
   * still usable, but the answer is broader than what was asked for.
   */
  constraintsRelaxed?: boolean;
  /** Whether a further planning round is worth spending budget on. */
  shouldReplan: boolean;
  /** One-line explanation, recorded on the trace and fed to the next planner call. */
  reason: string;
  /** Total result items across the round's successful actions. */
  resultCount: number;
}

// ============================================================================
// ASSESSMENT
// ============================================================================

/**
 * Count the items an action actually returned.
 *
 * Tool payload shapes vary by executor, so this checks the same keys the rest of
 * the pipeline treats as result arrays. `resultCount` is only trusted as a
 * fallback because some callers set it to a *total match count* rather than the
 * number of items returned.
 */
function countResults(action: ActionResult): number {
  const data = action.result.data as Record<string, unknown> | unknown[] | null | undefined;

  if (Array.isArray(data)) return data.length;
  if (data && typeof data === 'object') {
    for (const key of ['results', 'items', 'values', 'documents'] as const) {
      const value = (data as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value.length;
    }
    // Single-document shapes (lookup): found:false must not read as a result.
    if ('found' in data) return (data as { found?: boolean }).found ? 1 : 0;
    if ('document' in data || 'item' in data) return 1;
  }

  return action.result.resultCount ?? 0;
}

/**
 * Assess one planning round.
 *
 * `roundsRemaining` is the budget left *after* this round, so a caller with no
 * budget left never gets `shouldReplan: true` — the decision and the budget stay
 * in one place rather than being re-derived by the orchestrator.
 */
export function assessRound(
  execution: ExecutionLoopResult,
  roundsRemaining: number,
): RoundAssessment {
  const executed = execution.executedActions;

  if (executed.length === 0) {
    return {
      verdict: 'nothing_executed',
      // Re-planning cannot help if the executor never ran anything; the cause is
      // an empty plan or an exhausted batch, not a bad choice of tool.
      shouldReplan: false,
      reason: 'No actions were executed',
      resultCount: 0,
    };
  }

  const succeeded = executed.filter((a) => a.result.success);

  if (succeeded.length === 0) {
    const firstError = executed.find((a) => a.result.error)?.result.error;
    return {
      verdict: 'failed',
      shouldReplan: roundsRemaining > 0,
      reason: firstError
        ? `All ${executed.length} action(s) failed. First error: ${firstError}`
        : `All ${executed.length} action(s) failed`,
      resultCount: 0,
    };
  }

  const resultCount = succeeded.reduce((sum, a) => sum + countResults(a), 0);

  if (resultCount === 0) {
    return {
      verdict: 'empty',
      shouldReplan: roundsRemaining > 0,
      reason: `${succeeded.length} action(s) succeeded but returned no results`,
      resultCount: 0,
    };
  }

  // Results obtained only after ZeroResultRetryStep widened the request are
  // still usable — but they answer a broader question than the one asked, so the
  // fact is recorded rather than smoothed over. This is what previously made an
  // empty round look like a successful one: relaxation turned 0 results into
  // many, and the verdict read 'usable' with nothing noting the substitution.
  //
  // It deliberately does NOT force a re-plan: relaxed results are usually the
  // best available answer, and re-planning them would spend budget to arrive
  // back at the same place. Synthesis and the trace get the signal instead.
  const relaxed = succeeded.filter((a) => a.constraintsRelaxed);
  const relaxedNote = relaxed.length
    ? ` (constraints were relaxed on ${relaxed.map((a) => a.toolSlug).join(', ')} to find any results)`
    : '';

  return {
    verdict: 'usable',
    shouldReplan: false,
    reason: `${succeeded.length} action(s) returned ${resultCount} result(s)${relaxedNote}`,
    resultCount,
    ...(relaxed.length ? { constraintsRelaxed: true } : {}),
  };
}

// ============================================================================
// MERGING ROUNDS
// ============================================================================

/**
 * Combine rounds so synthesis sees everything that ran, not just the last
 * attempt. A first round that returned nothing is still evidence — it tells the
 * response that a narrower query was tried and came back empty.
 *
 * `remainingActions` is taken from the final round only: earlier rounds' leftover
 * actions were superseded by re-planning and offering them as suggestions would
 * point the user at a strategy already abandoned.
 */
export function mergeRounds(rounds: ExecutionLoopResult[]): ExecutionLoopResult {
  if (rounds.length === 0) {
    return {
      executedActions: [],
      remainingActions: [],
      aborted: false,
      summary: 'No actions to execute',
    };
  }
  if (rounds.length === 1) return rounds[0];

  const last = rounds[rounds.length - 1];
  return {
    executedActions: rounds.flatMap((r) => r.executedActions),
    remainingActions: last.remainingActions,
    aborted: rounds.some((r) => r.aborted),
    summary: rounds.map((r, i) => `Round ${i + 1}: ${r.summary}`).join(' | '),
  };
}
