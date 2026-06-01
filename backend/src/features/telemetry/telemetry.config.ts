// src/features/telemetry/telemetry.config.ts

/**
 * Telemetry Configuration
 *
 * Controls whether OpenTelemetry tracing is active, globally and per-experience.
 *
 * Master switch: ENABLE_OTEL=true (default: false)
 * Per-experience: overrides via setExperienceTelemetryOverride()
 *
 * Detail levels:
 * - 'off': No spans recorded
 * - 'metadata': Spans record timing, status, tokens — NOT user messages or AI responses
 * - 'full': Spans record everything including message content
 */

import { createLogger } from '@/shared/logger/logger';
import type { TelemetryConfig, TelemetryDetailLevel } from './telemetry.types';

const logger = createLogger('telemetry-config');

// Use globalThis to survive Next.js HMR module re-evaluation in dev mode.
// Without this, each HMR cycle re-creates currentConfig = null, losing all
// per-experience overrides that were loaded from DB at startup.
const GLOBAL_CONFIG_KEY = '__alpha_telemetry_config__' as const;

function getGlobalConfig(): TelemetryConfig | null {
  return (globalThis as Record<string, unknown>)[GLOBAL_CONFIG_KEY] as TelemetryConfig | null ?? null;
}

function setGlobalConfig(config: TelemetryConfig): void {
  (globalThis as Record<string, unknown>)[GLOBAL_CONFIG_KEY] = config;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initializeTelemetryConfig(): TelemetryConfig {
  const existing = getGlobalConfig();
  if (existing) return existing;

  const config: TelemetryConfig = {
    enabled: false,
    serviceName: 'alpha-search',
    serviceVersion: process.env.npm_package_version ?? '0.1.0',
    environment: process.env.NODE_ENV ?? 'development',
    exporterType: 'postgres',
    batchConfig: {
      maxQueueSize: 2048,
      maxExportBatchSize: 512,
      scheduledDelayMillis: 5000,
      exportTimeoutMillis: 30000,
    },
    experienceOverrides: new Map(),
  };

  // Master switch
  if (process.env.ENABLE_OTEL === 'true') {
    config.enabled = true;
  }

  // Service name override
  if (process.env.OTEL_SERVICE_NAME) {
    config.serviceName = process.env.OTEL_SERVICE_NAME;
  }

  // Batch config overrides
  if (process.env.OTEL_BATCH_DELAY_MS) {
    config.batchConfig.scheduledDelayMillis = parseInt(process.env.OTEL_BATCH_DELAY_MS, 10);
  }
  if (process.env.OTEL_BATCH_SIZE) {
    config.batchConfig.maxExportBatchSize = parseInt(process.env.OTEL_BATCH_SIZE, 10);
  }

  setGlobalConfig(config);

  logger.info('Telemetry config initialized', {
    enabled: config.enabled,
    serviceName: config.serviceName,
    environment: config.environment,
  });

  return config;
}

// ============================================================================
// GETTERS
// ============================================================================

export function getTelemetryConfig(): TelemetryConfig {
  return getGlobalConfig() ?? initializeTelemetryConfig();
}

/**
 * Check if telemetry is enabled for a given experience.
 *
 * Designed to be called at the root span level (chat turn or search request).
 * Child spans inherit the parent's decision through OTel context propagation.
 * Fast path: single Map lookup + boolean check.
 */
export function isTelemetryEnabled(experienceId?: string): boolean {
  return getTelemetryDetailLevel(experienceId) !== 'off';
}

/**
 * Get the telemetry detail level for an experience.
 *
 * Returns:
 * - 'off' if master switch is disabled or experience override is 'off'
 * - 'metadata' if experience is set to metadata-only (default when enabled)
 * - 'full' if experience explicitly opts in to full content logging
 */
export function getTelemetryDetailLevel(experienceId?: string): TelemetryDetailLevel {
  const config = getTelemetryConfig();
  if (!config.enabled) return 'off';

  // No experience context → default to metadata-only
  if (!experienceId) return 'metadata';

  // Check per-experience override
  const override = config.experienceOverrides.get(experienceId);
  if (override !== undefined) return override;

  // Default when master switch is on: metadata-only (safe default)
  return 'metadata';
}

/**
 * Check if content (user messages, AI responses) should be logged for an experience.
 * Only returns true when detail level is 'full'.
 */
export function shouldLogContent(experienceId?: string): boolean {
  return getTelemetryDetailLevel(experienceId) === 'full';
}

// ============================================================================
// PER-EXPERIENCE CONTROL
// ============================================================================

export function setExperienceTelemetryOverride(experienceId: string, level: TelemetryDetailLevel): void {
  const config = getTelemetryConfig();
  config.experienceOverrides.set(experienceId, level);
  logger.info('Telemetry experience override set', { experienceId, level });
}

export function clearExperienceTelemetryOverride(experienceId: string): void {
  const config = getTelemetryConfig();
  config.experienceOverrides.delete(experienceId);
}

export function clearAllTelemetryOverrides(): void {
  const config = getTelemetryConfig();
  config.experienceOverrides.clear();
}

// ============================================================================
// STARTUP SYNC — Load persistent overrides from DB
// ============================================================================

/**
 * Load telemetry overrides from both experience tables into memory.
 * Call once during app startup (after DB is ready).
 */
export async function loadTelemetryOverridesFromDB(): Promise<void> {
  try {
    const { db } = await import('@/db/index');
    const { searchExperiences } = await import('@/db/schema/search-experience.schema');
    const { aiExperiences } = await import('@/db/schema/ai-experience.schema');
    const { ne } = await import('drizzle-orm');

    const config = getTelemetryConfig();

    // Load search experience overrides (any non-'off' value)
    const searchRows = await db
      .select({
        id: searchExperiences.id,
        telemetryDetailLevel: searchExperiences.telemetryDetailLevel,
      })
      .from(searchExperiences)
      .where(ne(searchExperiences.telemetryDetailLevel, 'off'));

    for (const row of searchRows) {
      config.experienceOverrides.set(row.id, row.telemetryDetailLevel as TelemetryDetailLevel);
    }

    // Load AI experience overrides (telemetryDetailLevel is inside observability_config JSON)
    const { sql } = await import('drizzle-orm');
    const aiRows = await db
      .select({
        id: aiExperiences.id,
        telemetryDetailLevel: sql<string>`observability_config->>'telemetryDetailLevel'`,
      })
      .from(aiExperiences)
      .where(sql`observability_config->>'telemetryDetailLevel' != 'off'`);

    for (const row of aiRows) {
      if (row.telemetryDetailLevel) {
        config.experienceOverrides.set(row.id, row.telemetryDetailLevel as TelemetryDetailLevel);
      }
    }

    const total = searchRows.length + aiRows.length;
    if (total > 0) {
      logger.info('Loaded telemetry overrides from DB', {
        searchExperiences: searchRows.length,
        aiExperiences: aiRows.length,
      });
    }
  } catch (error) {
    logger.warn('Failed to load telemetry overrides from DB (table may not exist yet)', { error });
  }
}

// ============================================================================
// STATUS (for admin endpoints)
// ============================================================================

export function getTelemetryStatus(): {
  enabled: boolean;
  serviceName: string;
  environment: string;
  exporterType: string;
  experienceOverrideCount: number;
  experienceOverrides: Record<string, TelemetryDetailLevel>;
} {
  const config = getTelemetryConfig();
  return {
    enabled: config.enabled,
    serviceName: config.serviceName,
    environment: config.environment,
    exporterType: config.exporterType,
    experienceOverrideCount: config.experienceOverrides.size,
    experienceOverrides: Object.fromEntries(config.experienceOverrides),
  };
}
