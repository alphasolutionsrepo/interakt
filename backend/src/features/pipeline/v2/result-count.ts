// src/features/pipeline/v2/result-count.ts

/**
 * How many records a single-record tool result (a lookup) holds: 1 when it has its record,
 * 0 for `found: false`, undefined for any other shape (callers count lists themselves).
 */
export function singleRecordCount(data: unknown): number | undefined {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined;
  if ('found' in data) return (data as { found?: boolean }).found ? 1 : 0;
  if ('document' in data || 'item' in data) return 1;
  return undefined;
}
