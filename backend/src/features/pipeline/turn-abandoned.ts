// src/features/pipeline/turn-abandoned.ts

import type { ChatFn } from './v2/turn-planner';

import { CancelledRequestError, callerTimedOut } from '@/features/ai-service/adapters/types';

/**
 * Nobody will read the answer: the visitor closed the chat mid-turn, or the turn ran out
 * of time and the visitor was already told. The turn stops: a model call in flight is
 * aborted (chatUntilAbandoned), and no further step starts, so no more model or tool
 * calls, nothing saved. A tool call already running finishes first.
 *
 * It is not an error. Spans record where it stopped instead, and the chat stream logs a
 * visitor leaving once, at info. The analytics don't count a turn the visitor left as
 * failed (abandonedTurn in analytics-query.service); one that timed out keeps its
 * timed_out outcome, a failure.
 */
export class TurnAbandonedError extends Error {
  /** Where the turn stopped, as the log line and the trace show it */
  readonly step: string;

  constructor(step: string) {
    super(`Stopped before ${step}: nobody is waiting for the answer`);
    this.name = 'TurnAbandonedError';
    this.step = step;
  }
}

/** Stops the turn here when the visitor has gone */
export function stopIfAbandoned(signal: AbortSignal | undefined, step: string): void {
  if (signal?.aborted) throw new TurnAbandonedError(step);
}

/**
 * A step's caught error, as an Error, with how long the step ran. The turn stopping
 * (TurnAbandonedError) isn't the step failing: it is thrown on, with no fallback or log.
 */
export function stepFailure(error: unknown, startTime: number): { err: Error; durationMs: number } {
  if (error instanceof TurnAbandonedError) throw error;
  return { err: error instanceof Error ? error : new Error(String(error)), durationMs: Date.now() - startTime };
}

/**
 * The turn's model calls, stopped by the visitor leaving: each gets the signal, so leaving
 * aborts the provider request mid-call and no more tokens are spent on it, and a call
 * stopped that way ends the turn. The turn running out of time aborts it too, as a timeout
 * (TimeoutError): the AI service records the call as failed, and the turn stops the same
 * way. A call that fails for another reason fails as before.
 */
export function chatUntilAbandoned(chat: ChatFn, signal: AbortSignal | undefined): ChatFn {
  if (!signal) return chat;
  return async (messages, options) => {
    const step = `the ${options?.feature ?? 'model'} call finished`;
    stopIfAbandoned(signal, step);
    try {
      return await chat(messages, { ...options, signal });
    } catch (error) {
      if (error instanceof CancelledRequestError || callerTimedOut(signal)) stopIfAbandoned(signal, step);
      throw error;
    }
  };
}
