// src/app/analytics/traces/_lib/trace-message.ts

/**
 * What a trace holds of the visitor's words: their text, a blank one, or nothing.
 * Nothing means it wasn't stored ('Metadata only' telemetry); blank means it was.
 */
export type TraceMessage = { kind: 'text'; text: string } | { kind: 'empty' } | { kind: 'not-stored' };

/** What the visitor sent in this trace: a search experience gets a query, a chat a message. */
export function traceContent(operationName: string): 'query' | 'message' {
  return operationName.startsWith('search_experience.') ? 'query' : 'message';
}

export function traceMessage(userMessage: string | null | undefined): TraceMessage {
  if (userMessage == null) return { kind: 'not-stored' };
  const text = userMessage.trim();
  return text ? { kind: 'text', text } : { kind: 'empty' };
}
