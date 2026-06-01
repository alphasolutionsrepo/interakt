// src/features/analytics/analytics-cost.service.ts

/**
 * Analytics Cost Calculation Service
 *
 * Calculates estimated AI costs based on admin-configured model pricing.
 * Pricing is stored in the ai_provider_models table (inputCostPerMillionTokens, outputCostPerMillionTokens).
 *
 * DESIGN:
 * - Costs are estimates based on admin-configured pricing
 * - Pricing data is cached to avoid repeated DB lookups
 * - Calculations are synchronous for performance (uses cache)
 * - Cache is refreshed periodically or on-demand
 */

import 'server-only';

import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('analytics-cost');

// ============================================================================
// TYPES
// ============================================================================

export interface ModelPricing {
  providerId: string;
  providerKey: string;
  modelId: number;
  modelKey: string;
  inputCostPerMillionTokens: number | null;
  outputCostPerMillionTokens: number | null;
}

export interface CostEstimate {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  currency: 'USD';
  isPricingConfigured: boolean;
}

// ============================================================================
// PRICING CACHE
// ============================================================================

// Cache: modelKey -> ModelPricing
const pricingCache = new Map<string, ModelPricing>();
let cacheLastRefreshed: Date | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Build cache key from provider and model
 */
function getCacheKey(providerKey: string, modelKey: string): string {
  return `${providerKey}:${modelKey}`;
}

/**
 * Check if cache needs refresh
 */
function isCacheStale(): boolean {
  if (!cacheLastRefreshed) return true;
  return Date.now() - cacheLastRefreshed.getTime() > CACHE_TTL_MS;
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Refresh the pricing cache from the database
 */
export async function refreshPricingCache(): Promise<void> {
  try {
    const { db } = await import('@/db/index');
    const { aiProviderModels, aiProviders } = await import('@/db/schema/ai-providers.schema');
    const { eq, isNotNull, or } = await import('drizzle-orm');

    // Fetch all models with pricing configured
    const models = await db
      .select({
        id: aiProviderModels.id,
        modelKey: aiProviderModels.modelKey,
        inputCostPerMillionTokens: aiProviderModels.inputCostPerMillionTokens,
        outputCostPerMillionTokens: aiProviderModels.outputCostPerMillionTokens,
        providerId: aiProviderModels.providerId,
        providerKey: aiProviders.providerKey,
      })
      .from(aiProviderModels)
      .innerJoin(aiProviders, eq(aiProviderModels.providerId, aiProviders.id))
      .where(
        or(
          isNotNull(aiProviderModels.inputCostPerMillionTokens),
          isNotNull(aiProviderModels.outputCostPerMillionTokens)
        )
      );

    // Update cache
    pricingCache.clear();
    for (const model of models) {
      const key = getCacheKey(model.providerKey, model.modelKey);
      pricingCache.set(key, {
        providerId: model.providerId,
        providerKey: model.providerKey,
        modelId: model.id,
        modelKey: model.modelKey,
        inputCostPerMillionTokens: model.inputCostPerMillionTokens,
        outputCostPerMillionTokens: model.outputCostPerMillionTokens,
      });
    }

    cacheLastRefreshed = new Date();
    logger.debug('Pricing cache refreshed', { modelCount: models.length });
  } catch (error) {
    logger.error('Failed to refresh pricing cache', error as Error);
  }
}

/**
 * Get pricing for a specific model (from cache)
 */
export function getModelPricing(providerKey: string, modelKey: string): ModelPricing | null {
  const key = getCacheKey(providerKey, modelKey);
  return pricingCache.get(key) ?? null;
}

/**
 * Ensure cache is fresh (non-blocking refresh if stale)
 */
export function ensureCacheFresh(): void {
  if (isCacheStale()) {
    // Fire and forget - don't block on refresh
    refreshPricingCache().catch(() => {
      // Silently ignore refresh errors
    });
  }
}

// ============================================================================
// COST CALCULATION
// ============================================================================

/**
 * Calculate estimated cost for token usage
 *
 * @param providerKey - The provider key (e.g., 'openai', 'anthropic')
 * @param modelKey - The model key (e.g., 'gpt-4o', 'claude-3-opus')
 * @param inputTokens - Number of input/prompt tokens
 * @param outputTokens - Number of output/completion tokens
 * @returns Cost estimate in USD
 */
export function calculateCost(
  providerKey: string,
  modelKey: string,
  inputTokens: number,
  outputTokens: number
): CostEstimate {
  // Ensure cache is fresh (non-blocking)
  ensureCacheFresh();

  const pricing = getModelPricing(providerKey, modelKey);

  if (!pricing || (pricing.inputCostPerMillionTokens === null && pricing.outputCostPerMillionTokens === null)) {
    return {
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      currency: 'USD',
      isPricingConfigured: false,
    };
  }

  const inputCost = pricing.inputCostPerMillionTokens
    ? (inputTokens / 1_000_000) * pricing.inputCostPerMillionTokens
    : 0;

  const outputCost = pricing.outputCostPerMillionTokens
    ? (outputTokens / 1_000_000) * pricing.outputCostPerMillionTokens
    : 0;

  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
    currency: 'USD',
    isPricingConfigured: true,
  };
}

/**
 * Calculate cost and return just the total (for simple use cases)
 */
export function calculateTotalCost(
  providerKey: string,
  modelKey: string,
  inputTokens: number,
  outputTokens: number
): number | null {
  const estimate = calculateCost(providerKey, modelKey, inputTokens, outputTokens);
  return estimate.isPricingConfigured ? estimate.totalCost : null;
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Calculate costs for multiple operations at once
 */
export function calculateBatchCosts(
  operations: Array<{
    providerKey: string;
    modelKey: string;
    inputTokens: number;
    outputTokens: number;
  }>
): CostEstimate[] {
  // Ensure cache is fresh before batch processing
  ensureCacheFresh();

  return operations.map((op) =>
    calculateCost(op.providerKey, op.modelKey, op.inputTokens, op.outputTokens)
  );
}

/**
 * Calculate total costs for a batch of operations
 */
export function calculateBatchTotalCost(
  operations: Array<{
    providerKey: string;
    modelKey: string;
    inputTokens: number;
    outputTokens: number;
  }>
): { totalCost: number; operationsWithPricing: number; operationsWithoutPricing: number } {
  const estimates = calculateBatchCosts(operations);

  let totalCost = 0;
  let operationsWithPricing = 0;
  let operationsWithoutPricing = 0;

  for (const estimate of estimates) {
    if (estimate.isPricingConfigured) {
      totalCost += estimate.totalCost;
      operationsWithPricing++;
    } else {
      operationsWithoutPricing++;
    }
  }

  return { totalCost, operationsWithPricing, operationsWithoutPricing };
}

// ============================================================================
// CACHE STATS
// ============================================================================

/**
 * Get cache statistics for monitoring
 */
export function getCacheStats(): {
  size: number;
  lastRefreshed: Date | null;
  isStale: boolean;
  models: string[];
} {
  return {
    size: pricingCache.size,
    lastRefreshed: cacheLastRefreshed,
    isStale: isCacheStale(),
    models: Array.from(pricingCache.keys()),
  };
}

/**
 * Force cache refresh (for admin operations)
 */
export async function forceRefreshCache(): Promise<void> {
  await refreshPricingCache();
}

/**
 * Clear cache (for testing)
 */
export function clearCache(): void {
  pricingCache.clear();
  cacheLastRefreshed = null;
}
