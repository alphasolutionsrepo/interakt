// src/shared/seeders/index.ts

/**
 * Seeders - Main Entry Point
 * 
 * Orchestrates all seeding operations for the application.
 * Called from instrumentation.ts on server startup (if enabled).
 */

import { createLogger } from '@/shared/logger/logger';
import { seedAIProviders, verifySeededProviders } from './ai-providers/index';
import { seedSystemDefaults as seedPromptTemplates } from '@/features/prompt-templates/prompt-template.service';
import type { SeedingResult, SeedOptions, SeedOperationResult } from './seeder.types';

const logger = createLogger('seeder');

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Check if auto-seeding is enabled
 */
export function isAutoSeedingEnabled(): boolean {
  // Default: enabled in development, disabled in production
  const envValue = process.env.ENABLE_AUTO_SEEDING;

  if (envValue !== undefined) {
    return envValue === 'true';
  }

  // Default based on environment
  return process.env.NODE_ENV === 'development';
}

/**
 * Check if force reseed is enabled (dangerous!)
 */
export function isForceReseedEnabled(): boolean {
  return process.env.FORCE_RESEED === 'true';
}

// ============================================================================
// MAIN SEEDING ORCHESTRATOR
// ============================================================================

/**
 * Run all seeding operations
 * 
 * This is the main entry point for seeding, typically called from:
 * - instrumentation.ts (on server startup)
 * - Admin API (manual trigger)
 */
export async function runAllSeeding(options: SeedOptions = {}): Promise<SeedingResult> {
  const startTime = Date.now();
  const operations: SeedOperationResult[] = [];

  logger.info('🌱 Starting application seeding', {
    force: options.force ?? false,
    dryRun: options.dryRun ?? false,
  });

  try {
    // -------------------------------------------------------------------------
    // 1. Seed AI Providers
    // -------------------------------------------------------------------------
    const aiProvidersResult = await seedAIProviders(options);
    operations.push(aiProvidersResult);

    // -------------------------------------------------------------------------
    // 2. Seed Prompt Templates
    // -------------------------------------------------------------------------
    try {
      await seedPromptTemplates();
      operations.push({
        seedType: 'prompt_templates',
        success: true,
        totalProcessed: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
        items: [],
        duration: 0,
      });
    } catch (error) {
      logger.error('Failed to seed prompt templates', error as Error);
      operations.push({
        seedType: 'prompt_templates',
        success: false,
        totalProcessed: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: 1,
        items: [{ key: 'prompt_templates', status: 'error', message: (error as Error).message }],
        duration: 0,
      });
    }

    const totalDuration = Date.now() - startTime;
    const success = operations.every(op => op.success);

    const result: SeedingResult = {
      success,
      operations,
      totalDuration,
      timestamp: new Date().toISOString(),
    };

    // Log summary
    const summary = operations.map(op => ({
      type: op.seedType,
      created: op.created,
      skipped: op.skipped,
      errors: op.errors,
    }));

    logger.info('🌱 Seeding complete', {
      success,
      totalDuration: `${totalDuration}ms`,
      summary,
    });

    return result;

  } catch (error) {
    const totalDuration = Date.now() - startTime;

    logger.error('Seeding failed with unexpected error', error as Error);

    return {
      success: false,
      operations,
      totalDuration,
      timestamp: new Date().toISOString(),
    };
  }
}

// ============================================================================
// STARTUP SEEDING (Called from instrumentation.ts)
// ============================================================================

/**
 * Run seeding on application startup
 * 
 * This function is called once when the server starts.
 * It checks if seeding is enabled and runs appropriate seeders.
 */
export async function runStartupSeeding(): Promise<void> {
  // Check if seeding is enabled
  if (!isAutoSeedingEnabled()) {
    logger.debug('Auto-seeding is disabled');
    return;
  }

  logger.info('🚀 Running startup seeding...');

  try {
    const options: SeedOptions = {
      force: isForceReseedEnabled(),
      dryRun: false,
    };

    if (options.force) {
      logger.warn('⚠️ Force reseed is enabled - existing data may be overwritten!');
    }

    const result = await runAllSeeding(options);

    if (result.success) {
      logger.info('✅ Startup seeding completed successfully', {
        operations: result.operations.map(op => ({
          type: op.seedType,
          created: op.created,
          skipped: op.skipped,
        })),
      });
    } else {
      logger.error('❌ Startup seeding completed with errors', {
        operations: result.operations.map(op => ({
          type: op.seedType,
          errors: op.errors,
          errorDetails: op.items.filter(i => i.status === 'error'),
        })),
      });
    }

  } catch (error) {
    logger.error('❌ Startup seeding failed', error as Error);
    // Don't throw - allow the app to continue even if seeding fails
  }
}

// ============================================================================
// SELECTIVE SEEDING
// ============================================================================

/**
 * Seed only AI providers
 */
export async function seedOnlyAIProviders(options: SeedOptions = {}): Promise<SeedOperationResult> {
  logger.info('Running AI providers seeding only', { options });
  return await seedAIProviders(options);
}

// ============================================================================
// VERIFICATION & STATUS
// ============================================================================

/**
 * Verify all seeded data
 */
export async function verifyAllSeeding(): Promise<{
  success: boolean;
  aiProviders: Awaited<ReturnType<typeof verifySeededProviders>>;
}> {
  const aiProviders = await verifySeededProviders();

  return {
    success: aiProviders.valid,
    aiProviders,
  };
}

/**
 * Get seeding status from registry
 */
export async function getSeedingStatus() {
  const { getSeedingStatus: getStatus } = await import('./seed-registry.service');
  return getStatus();
}

/**
 * Get overall seeding status
 */
export async function getOverallSeedingStatus() {
  const status = await getSeedingStatus();
  const verification = await verifyAllSeeding();

  return {
    autoSeedingEnabled: isAutoSeedingEnabled(),
    forceReseedEnabled: isForceReseedEnabled(),
    registry: status,
    verification,
  };
}

// ============================================================================
// RE-EXPORTS
// ============================================================================

export type {
  SeedingResult,
  SeedOperationResult,
  SeedItemResult,
  SeedOptions,
} from './seeder.types';

// AI Providers
export {
  seedAIProviders,
  verifySeededProviders,
  getSeedProviderByKey,
  getAllSeedProviderKeys,
  AI_PROVIDER_SEEDS,
  SYSTEM_DEFAULTS_SEED,
} from './ai-providers/index';

// Registry
export {
  clearRegistryByType,
  SEED_TYPES,
} from './seed-registry.service';