// src/features/analytics/analytics-retention.ts

/**
 * Analytics Data Retention
 *
 * Automatic cleanup of old analytics data to prevent unbounded DB growth.
 * Runs periodically in the background, deleting records older than their
 * configured retention period.
 *
 * DESIGN:
 * - Non-blocking: runs on a daily timer, never impacts request flow
 * - Batch deletes: avoids long-running transactions
 * - Per-table retention: different data types have different lifespans
 * - Safe: logs all deletions, catches all errors
 */

import { sql } from 'drizzle-orm';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('analytics-retention');

// ============================================================================
// RETENTION CONFIGURATION
// ============================================================================

/**
 * Retention periods per table (in days).
 *
 * Granular event tables: 90 days (high volume)
 * Aggregated/summary tables: 365 days (compact, useful for trends)
 * Operational tables: 30 days (short-lived monitoring data)
 */
const RETENTION_POLICIES: RetentionPolicy[] = [
  // High-volume event tables — 90 days
  { table: 'search_events', timestampColumn: 'timestamp', retentionDays: 90 },
  { table: 'ai_usage_events', timestampColumn: 'timestamp', retentionDays: 90 },
  { table: 'ai_tool_executions', timestampColumn: 'timestamp', retentionDays: 90 },
  { table: 'search_result_clicks', timestampColumn: 'timestamp', retentionDays: 90 },
  { table: 'otel_spans', timestampColumn: 'start_time', retentionDays: 90 },
  { table: 'analytics_sessions', timestampColumn: 'started_at', retentionDays: 90 },
  { table: 'chat_session_analytics', timestampColumn: 'started_at', retentionDays: 180 },

  // Admin chat sessions — 180 days (admin conversations, keep longer)
  { table: 'admin_chat_sessions', timestampColumn: 'created_at', retentionDays: 180 },

  // Aggregated/summary tables — 365 days
  { table: 'popular_queries', timestampColumn: 'date', retentionDays: 365 },
  { table: 'zero_result_queries', timestampColumn: 'last_seen_at', retentionDays: 365 },
  { table: 'search_summary', timestampColumn: 'time_bucket', retentionDays: 365 },
  { table: 'ai_usage_summary', timestampColumn: 'time_bucket', retentionDays: 365 },

  // Operational — 30 days
  { table: 'provider_health', timestampColumn: 'window_start', retentionDays: 30 },
];

interface RetentionPolicy {
  table: string;
  timestampColumn: string;
  retentionDays: number;
}

interface RetentionResult {
  table: string;
  deletedCount: number;
  error?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/** How often to run cleanup (default: once per day) */
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Max rows to delete per batch to avoid long-running transactions */
const BATCH_DELETE_LIMIT = 1000;

// ============================================================================
// STATE
// ============================================================================

let cleanupTimer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let lastCleanupAt: Date | null = null;
let lastCleanupResults: RetentionResult[] = [];

// ============================================================================
// MAIN CLEANUP FUNCTION
// ============================================================================

/**
 * Run retention cleanup across all analytics tables.
 * Deletes records older than each table's configured retention period.
 *
 * Safe to call manually (e.g., from an admin endpoint) or via the timer.
 */
export async function runRetentionCleanup(): Promise<RetentionResult[]> {
  if (isRunning) {
    logger.info('Retention cleanup already in progress, skipping');
    return [];
  }

  isRunning = true;
  const startTime = Date.now();
  const results: RetentionResult[] = [];

  logger.info('Starting retention cleanup', {
    policies: RETENTION_POLICIES.map(p => `${p.table}: ${p.retentionDays}d`),
  });

  try {
    const { analyticsDB } = await import('@/db/index');

    if (!analyticsDB) {
      logger.warn('Analytics DB not configured, skipping retention cleanup');
      return [];
    }

    for (const policy of RETENTION_POLICIES) {
      const result = await cleanupTable(analyticsDB, policy);
      results.push(result);
    }

    const totalDeleted = results.reduce((sum, r) => sum + r.deletedCount, 0);
    const errors = results.filter(r => r.error);
    const durationMs = Date.now() - startTime;

    lastCleanupAt = new Date();
    lastCleanupResults = results;

    logger.info('Retention cleanup completed', {
      totalDeleted,
      durationMs,
      tablesProcessed: results.length,
      errors: errors.length,
      details: results
        .filter(r => r.deletedCount > 0 || r.error)
        .map(r => `${r.table}: ${r.deletedCount} deleted${r.error ? ` (error: ${r.error})` : ''}`),
    });

    return results;
  } catch (error) {
    logger.error('Retention cleanup failed', error as Error);
    return results;
  } finally {
    isRunning = false;
  }
}

/**
 * Clean up a single table according to its retention policy.
 * Deletes in batches to avoid long-running transactions.
 */
async function cleanupTable(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: { execute: (query: any) => Promise<any> },
  policy: RetentionPolicy
): Promise<RetentionResult> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);

  let totalDeleted = 0;

  // drizzle db.execute() with raw sql doesn't serialize Date objects —
  // pass timestamps as ISO strings so postgres.js handles them correctly
  const cutoffIso = cutoffDate.toISOString();

  try {
    // Check if the table exists before attempting cleanup.
    // Schema may be defined but not yet migrated to the database.
    const tableCheck = await db.execute(sql`
      SELECT 1 FROM information_schema.tables
      WHERE table_name = ${policy.table}
      LIMIT 1
    `);

    if (!Array.isArray(tableCheck) || tableCheck.length === 0) {
      logger.debug(`Retention: table ${policy.table} does not exist, skipping`);
      return { table: policy.table, deletedCount: 0 };
    }

    // Delete in batches using ctid to limit rows per transaction
    let batchDeleted: number;
    do {
      const result = await db.execute(sql`
        DELETE FROM ${sql.identifier(policy.table)}
        WHERE ctid IN (
          SELECT ctid FROM ${sql.identifier(policy.table)}
          WHERE ${sql.identifier(policy.timestampColumn)} < ${cutoffIso}::timestamptz
          LIMIT ${BATCH_DELETE_LIMIT}
        )
      `);

      // postgres-js returns RowList with .count for DML statements
      batchDeleted = Number((result as { count?: number }).count ?? 0);
      totalDeleted += batchDeleted;

      if (batchDeleted > 0) {
        logger.debug(`Retention: deleted ${batchDeleted} rows from ${policy.table}`, {
          totalDeleted,
          cutoffDate: cutoffDate.toISOString(),
        });
      }
    } while (batchDeleted === BATCH_DELETE_LIMIT);

    if (totalDeleted > 0) {
      logger.info(`Retention: ${policy.table} — deleted ${totalDeleted} rows older than ${policy.retentionDays} days`);
    }

    return { table: policy.table, deletedCount: totalDeleted };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Retention cleanup failed for ${policy.table}`, error as Error, {
      cutoffDate: cutoffDate.toISOString(),
      retentionDays: policy.retentionDays,
    });
    return { table: policy.table, deletedCount: totalDeleted, error: message };
  }
}

// ============================================================================
// LIFECYCLE
// ============================================================================

/**
 * Start the periodic retention cleanup timer.
 * Runs cleanup once immediately, then on the configured interval.
 */
export function startRetentionCleanup(): void {
  if (cleanupTimer) {
    logger.debug('Retention cleanup timer already running');
    return;
  }

  logger.info('Starting retention cleanup timer', {
    intervalMs: CLEANUP_INTERVAL_MS,
    intervalHours: CLEANUP_INTERVAL_MS / (60 * 60 * 1000),
  });

  // Run first cleanup after a short delay (let the app fully start)
  setTimeout(() => {
    runRetentionCleanup().catch(err => {
      logger.error('Initial retention cleanup failed', err as Error);
    });
  }, 30_000); // 30 seconds after start

  // Then run on interval
  cleanupTimer = setInterval(() => {
    runRetentionCleanup().catch(err => {
      logger.error('Periodic retention cleanup failed', err as Error);
    });
  }, CLEANUP_INTERVAL_MS);

  // Allow process to exit even if timer is running
  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }
}

/**
 * Stop the retention cleanup timer.
 */
export function stopRetentionCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
    logger.info('Retention cleanup timer stopped');
  }
}

// ============================================================================
// STATUS
// ============================================================================

/**
 * Get retention cleanup status (for monitoring/admin endpoints).
 */
export function getRetentionStatus() {
  return {
    timerRunning: cleanupTimer !== null,
    isRunning,
    lastCleanupAt,
    lastCleanupResults,
    policies: RETENTION_POLICIES.map(p => ({
      table: p.table,
      retentionDays: p.retentionDays,
      timestampColumn: p.timestampColumn,
    })),
  };
}
