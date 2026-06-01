// src/features/analytics/analytics-data-management.service.ts

/**
 * Analytics Data Management Service
 *
 * Provides cleanup utilities for analytics data.
 * Supports scoped deletion (by type and/or experience).
 */

import 'server-only';

import { sql } from 'drizzle-orm';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('analytics-data-management');

// ============================================================================
// TYPES
// ============================================================================

export type CleanupScope = 'all' | 'insights' | 'spans' | 'events' | 'sessions';

export interface CleanupOptions {
  scope: CleanupScope;
  experienceId?: string;
}

export interface CleanupResult {
  deletedCounts: Record<string, number>;
  totalDeleted: number;
}

// ============================================================================
// MAIN CLEANUP FUNCTION
// ============================================================================

export async function clearAnalyticsData(
  options: CleanupOptions
): Promise<CleanupResult> {
  const { analyticsDB } = await import('@/db/index');

  if (!analyticsDB) {
    return { deletedCounts: {}, totalDeleted: 0 };
  }

  const deletedCounts: Record<string, number> = {};
  const { scope, experienceId } = options;

  logger.info('Clearing analytics data', { scope, experienceId });

  // Helper: delete from table with optional experienceId filter
  async function deleteFromTable(
    tableName: string,
    experienceColumn?: string
  ): Promise<number> {
    let query: string;
    if (experienceId && experienceColumn) {
      query = `DELETE FROM ${tableName} WHERE ${experienceColumn} = '${experienceId}'`;
    } else {
      query = `TRUNCATE ${tableName} CASCADE`;
    }

    try {
      const result = await analyticsDB!.execute(sql.raw(query));
      const count = typeof result === 'object' && result !== null && 'rowCount' in result
        ? (result as { rowCount: number }).rowCount || 0
        : 0;
      deletedCounts[tableName] = count;
      return count;
    } catch (error) {
      logger.warn(`Failed to clear ${tableName}`, { error });
      deletedCounts[tableName] = 0;
      return 0;
    }
  }

  // Execute based on scope
  if (scope === 'all' || scope === 'insights') {
    await deleteFromTable('analytics_insights', 'experience_id');
    await deleteFromTable('analytics_processing_runs', 'experience_id');
  }

  if (scope === 'all' || scope === 'spans') {
    await deleteFromTable('otel_spans', 'experience_id');
  }

  if (scope === 'all' || scope === 'events') {
    // Order matters due to foreign keys
    await deleteFromTable('search_result_clicks');
    await deleteFromTable('ai_tool_executions');
    await deleteFromTable('search_events', 'experience_id');
    await deleteFromTable('ai_usage_events');
    await deleteFromTable('popular_queries', 'experience_id');
    await deleteFromTable('zero_result_queries', 'experience_id');
    await deleteFromTable('search_summary', 'experience_id');
    await deleteFromTable('ai_usage_summary');
    await deleteFromTable('chat_session_analytics');
  }

  if (scope === 'all' || scope === 'sessions') {
    await deleteFromTable('analytics_sessions', 'experience_id');
    await deleteFromTable('admin_chat_sessions');
  }

  const totalDeleted = Object.values(deletedCounts).reduce((a, b) => a + b, 0);

  logger.info('Analytics data cleared', { scope, experienceId, totalDeleted, deletedCounts });

  return { deletedCounts, totalDeleted };
}
