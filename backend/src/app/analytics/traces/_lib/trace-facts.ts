// src/app/analytics/traces/_lib/trace-facts.ts

import type { TraceListFacts } from '@/features/telemetry/telemetry.types';

/**
 * Short facts that tell traces apart in the Traces list, from metadata recorded at
 * every telemetry level: the model, the tokens, and the number of results.
 */
export function traceFacts(span: TraceListFacts): string[] {
  const facts: string[] = [];
  if (span.modelKeys) facts.push(span.modelKeys);
  if (span.totalTokens) facts.push(`${span.totalTokens.toLocaleString('en-US')} tokens`);
  if (span.resultsReturned != null) {
    facts.push(`${span.resultsReturned} ${span.resultsReturned === 1 ? 'result' : 'results'}`);
  }
  return facts;
}
