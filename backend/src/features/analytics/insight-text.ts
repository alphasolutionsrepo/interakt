// src/features/analytics/insight-text.ts

/**
 * Some insights are built from what visitors typed (messages, queries, search input).
 * Traces keep that text only for experiences on 'Full' telemetry, so on 'Metadata only'
 * those insights come out empty. They say why instead of looking like "no demand".
 */

export const NEEDS_FULL_TELEMETRY =
  "These insights use what visitors typed, which traces keep only for experiences whose Telemetry setting is Full.";

/** Whether any span holds one of the text attributes; when spans exist but none do, a note. */
export function textAvailability(
  spans: Array<{ attributes: Record<string, unknown> }>,
  keys: readonly string[],
): { textAvailable: boolean; note?: string } {
  const textAvailable = spans.some((span) => keys.some((key) => typeof span.attributes?.[key] === 'string'));
  return textAvailable || spans.length === 0 ? { textAvailable } : { textAvailable, note: NEEDS_FULL_TELEMETRY };
}
