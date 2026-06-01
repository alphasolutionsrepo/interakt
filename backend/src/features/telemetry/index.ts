// src/features/telemetry/index.ts

/**
 * Telemetry Feature — Public API
 *
 * Provides OpenTelemetry tracing for Alpha Search.
 *
 * USAGE:
 * ```typescript
 * import { withSpan, withStreamSpan, ATTR } from '@/features/telemetry';
 *
 * // Wrap any async operation:
 * const result = await withSpan(
 *   { name: 'search.execute', experienceId, attributes: { [ATTR.SEARCH_QUERY]: query } },
 *   async (span) => {
 *     const result = await provider.search(request);
 *     span.setAttribute(ATTR.SEARCH_TOTAL_RESULTS, result.total);
 *     return result;
 *   }
 * );
 *
 * // Wrap streaming (AsyncGenerator):
 * yield* withStreamSpan(
 *   { name: 'ai.stream_chat', attributes: { ... } },
 *   async function*(span) { ... }
 * );
 * ```
 */

// ============================================================================
// TRACING UTILITIES (main API for features)
// ============================================================================

export {
  withSpan,
  withStreamSpan,
  withSpanSync,
  addSpanAttributes,
  addSpanEvent,
  getTracer,
} from './tracing-utils';

// ============================================================================
// ATTRIBUTE KEYS
// ============================================================================

export { ATTR } from './attribute-keys';

// ============================================================================
// LIFECYCLE (for instrumentation.ts)
// ============================================================================

export { initializeTelemetry, shutdownTelemetry, flushTelemetry } from './telemetry.init';
export { initializeTelemetryConfig } from './telemetry.config';

// ============================================================================
// CONFIGURATION & STATUS (for admin endpoints)
// ============================================================================

export {
  getTelemetryConfig,
  getTelemetryStatus,
  isTelemetryEnabled,
  getTelemetryDetailLevel,
  shouldLogContent,
  setExperienceTelemetryOverride,
  clearExperienceTelemetryOverride,
  clearAllTelemetryOverrides,
  loadTelemetryOverridesFromDB,
} from './telemetry.config';

// ============================================================================
// TYPES
// ============================================================================

export type { TelemetryConfig, TelemetryDetailLevel, SpanOptions, StreamSpanOptions } from './telemetry.types';
