// src/features/telemetry/log-content.ts

/**
 * What log lines keep of visitors' words: the same as traces. A visitor's question (or a
 * value taken from it) is written to a log line only when the experience's telemetry level
 * is 'full'; otherwise the line keeps its length. See content-policy.ts for the trace side.
 */

import { trace } from '@opentelemetry/api';

import { ATTR } from './attribute-keys';
import { shouldLogContent } from './telemetry.config';

/**
 * Whether a log line may keep visitors' words. With an experience, its own telemetry level
 * decides. Without one, the line follows the decision its trace made when it started (the
 * request it belongs to); with no trace, only an admin's request for a full trace allows it.
 */
export function mayLogContent(experienceId?: string): boolean {
  if (experienceId) return shouldLogContent(experienceId);
  const span = trace.getActiveSpan() as unknown as { attributes?: Record<string, unknown> } | undefined;
  const recorded = span?.attributes?.[ATTR.CONTENT_RECORDED];
  return typeof recorded === 'boolean' ? recorded : shouldLogContent();
}

/**
 * Log fields for visitors' words: each field as it is when content may be logged, otherwise
 * its length under `<name>Length` (`query` → `queryLength`). Missing values are left out.
 * `maxChars` shortens the text a line keeps; the length is always of the whole text.
 */
export function contentForLog(
  fields: Record<string, string | null | undefined>,
  experienceId?: string,
  options: { maxChars?: number } = {},
): Record<string, string | number> {
  const keep = mayLogContent(experienceId);
  const out: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(fields)) {
    if (value == null) continue;
    if (keep) out[name] = options.maxChars === undefined ? value : value.substring(0, options.maxChars);
    else out[`${name}Length`] = value.length;
  }
  return out;
}
