// src/features/pipeline/turn-abandoned.ts

/**
 * The visitor closed the chat mid-turn. Nobody will read the answer, so the turn stops
 * before its next step: no more model or tool calls, nothing saved. The call already
 * running finishes; only the ones after it are skipped.
 *
 * It is not a failure. Spans record where it stopped instead of an error, the chat
 * stream logs it once, at info, and the analytics don't count it as a failed turn
 * (abandonedTurn in analytics-query.service).
 */
export class TurnAbandonedError extends Error {
  /** The step that was not started, as the log line and the trace show it */
  readonly step: string;

  constructor(step: string) {
    super(`The visitor left before ${step}`);
    this.name = 'TurnAbandonedError';
    this.step = step;
  }
}

/** Stops the turn here when the visitor has gone */
export function stopIfAbandoned(signal: AbortSignal | undefined, step: string): void {
  if (signal?.aborted) throw new TurnAbandonedError(step);
}
