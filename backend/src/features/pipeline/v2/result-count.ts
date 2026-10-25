// src/features/pipeline/v2/result-count.ts

/**
 * How many records a single-record tool result (a lookup) holds: 1 when it has its record,
 * the number of matches when several items fit (the answer asks which one), 0 for any other
 * `found: false`, undefined for other shapes (callers count lists themselves).
 */
export function singleRecordCount(data: unknown): number | undefined {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined;
  const { matches } = data as { matches?: unknown };
  if (Array.isArray(matches)) return matches.length;
  if ('found' in data) return (data as { found?: boolean }).found ? 1 : 0;
  if ('document' in data || 'item' in data) return 1;
  return undefined;
}
