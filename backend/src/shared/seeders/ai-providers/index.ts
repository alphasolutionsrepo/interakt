// src/shared/seeders/ai-providers/index.ts

/**
 * AI Providers Seeder
 * Handles seeding of AI providers, models, and system defaults with idempotency
 * 
 * Follows the same pattern as data-templates seeder
 */

import { createLogger } from '@/shared/logger/logger';
import { db } from '@/db/index';
import { aiProviders, aiProviderModels, systemDefaults } from '@/db/schema/ai-providers.schema';
import { eq } from 'drizzle-orm';
import { discoverOllamaModels } from '@/features/ai-providers/ai-providers.service';
import * as registryService from '../seed-registry.service';
import { SEED_TYPES } from '@/db/schema/seed-registry.schema';
import {
    AI_PROVIDER_SEEDS,
    SYSTEM_DEFAULTS_SEED,
    getSeedProviderByKey,
    type SeedAIProvider,
} from './ai-providers.seeds';
import type {
    SeedOperationResult,
    SeedItemResult,
    SeedOptions,
} from '../seeder.types';

const logger = createLogger('ai-providers-seeder');

// ============================================================================
// MAIN SEEDING FUNCTION
// ============================================================================

/**
 * Seed all AI providers, their models, and system defaults
 * 
 * Behavior:
 * - New providers: Create them with their models
 * - Existing providers (unchanged): Skip
 * - Existing providers (seed changed): Skip and log warning
 * - Force mode: Delete and recreate all
 */
export async function seedAIProviders(options: SeedOptions = {}): Promise<SeedOperationResult> {
    const startTime = Date.now();
    const { force = false, keys, dryRun = false } = options;

    logger.info('Starting AI providers seeding', {
        force,
        dryRun,
        specificKeys: keys?.length ?? 'all',
    });

    const result: SeedOperationResult = {
        success: true,
        seedType: SEED_TYPES.AI_PROVIDER,
        totalProcessed: 0,
        created: 0,
        skipped: 0,
        updated: 0,
        errors: 0,
        items: [],
        duration: 0,
    };

    // Determine which providers to process
    const providersToSeed = keys
        ? keys.map(key => getSeedProviderByKey(key)).filter(Boolean) as SeedAIProvider[]
        : AI_PROVIDER_SEEDS;

    result.totalProcessed = providersToSeed.length;

    // Process each provider
    for (const seedProvider of providersToSeed) {
        try {
            const itemResult = await seedSingleProvider(seedProvider, { force, dryRun });
            result.items.push(itemResult);

            // A new Ollama catalog lists models the machine may not have: keep only what's installed
            if (itemResult.status === 'created' && seedProvider.providerKey === 'ollama' && itemResult.entityId && !dryRun) {
                await syncOllamaCatalog(String(itemResult.entityId));
            }

            switch (itemResult.status) {
                case 'created':
                    result.created++;
                    break;
                case 'skipped':
                    result.skipped++;
                    break;
                case 'updated':
                    result.updated++;
                    break;
                case 'error':
                    result.errors++;
                    result.success = false;
                    break;
            }
        } catch (error) {
            logger.error('Failed to seed provider', error as Error, { providerKey: seedProvider.providerKey });
            result.items.push({
                key: seedProvider.providerKey,
                status: 'error',
                message: `Failed to seed: ${(error as Error).message}`,
            });
            result.errors++;
            result.success = false;
        }
    }

    // Seed system defaults (only if not doing specific keys)
    if (!keys) {
        try {
            const defaultsResult = await seedSystemDefaults({ force, dryRun });
            result.items.push(defaultsResult);
            if (defaultsResult.status === 'error') {
                result.errors++;
                result.success = false;
            }
        } catch (error) {
            logger.error('Failed to seed system defaults', error as Error);
            result.items.push({
                key: 'system-defaults',
                status: 'error',
                message: `Failed to seed system defaults: ${(error as Error).message}`,
            });
            result.errors++;
            result.success = false;
        }
    }

    result.duration = Date.now() - startTime;

    logger.info('AI providers seeding completed', {
        success: result.success,
        created: result.created,
        skipped: result.skipped,
        errors: result.errors,
        duration: `${result.duration}ms`,
    });

    return result;
}

// ============================================================================
// SINGLE PROVIDER SEEDING
// ============================================================================

/**
 * Seed a single provider with its models
 */
async function seedSingleProvider(
    seedProvider: SeedAIProvider,
    options: { force: boolean; dryRun: boolean }
): Promise<SeedItemResult> {
    const { providerKey, displayName } = seedProvider;
    const { force, dryRun } = options;

    // Calculate checksum for change detection
    const checksum = registryService.calculateChecksum(seedProvider);

    // Check registry for existing seed
    const registryEntry = await registryService.getRegistryEntry(
        SEED_TYPES.AI_PROVIDER,
        providerKey
    );

    // Check if provider already exists in DB
    const existingProvider = await db.query.aiProviders.findFirst({
        where: eq(aiProviders.providerKey, providerKey),
    });

    if (existingProvider) {
        if (force) {
            // Force mode: Delete and recreate
            if (dryRun) {
                return {
                    key: providerKey,
                    status: 'updated',
                    message: `[DRY RUN] Would recreate provider "${displayName}" with ${seedProvider.models.length} models`,
                };
            }

            // Delete existing provider (cascades to models)
            await db.delete(aiProviders).where(eq(aiProviders.id, existingProvider.id));
            logger.info('Deleted existing provider for force reseed', { providerKey });
        } else if (registryEntry && registryEntry.checksum !== checksum) {
            // Seed data changed but provider exists - warn and skip
            logger.warn('Seed data changed but provider exists - skipping', {
                providerKey,
                storedChecksum: registryEntry.checksum,
                newChecksum: checksum,
            });

            return {
                key: providerKey,
                status: 'skipped',
                message: `Provider "${displayName}" exists and seed data changed. Use force mode to recreate.`,
                entityId: existingProvider.id,
            };
        } else {
            // Provider exists and unchanged - skip
            logger.debug('Provider already exists - skipping', { providerKey });

            return {
                key: providerKey,
                status: 'skipped',
                message: `Provider "${displayName}" already exists`,
                entityId: existingProvider.id,
            };
        }
    }

    // Create provider
    if (dryRun) {
        return {
            key: providerKey,
            status: 'created',
            message: `[DRY RUN] Would create provider "${displayName}" with ${seedProvider.models.length} models`,
        };
    }

    const created = await createProviderFromSeed(seedProvider);

    // Record in registry
    await registryService.upsertRegistryEntry(
        SEED_TYPES.AI_PROVIDER,
        providerKey,
        checksum,
        { providerId: created.id, displayName, modelCount: seedProvider.models.length }
    );

    logger.info('Created seed provider', {
        providerKey,
        id: created.id,
        modelCount: seedProvider.models.length,
    });

    return {
        key: providerKey,
        status: 'created',
        message: `Created provider "${displayName}" with ${seedProvider.models.length} models`,
        entityId: created.id,
    };
}

// ============================================================================
// SYSTEM DEFAULTS SEEDING
// ============================================================================

/**
 * Seed system defaults
 */
async function seedSystemDefaults(
    options: { force: boolean; dryRun: boolean }
): Promise<SeedItemResult> {
    const { force, dryRun } = options;

    // Check if defaults already exist
    const existingDefaults = await db.query.systemDefaults.findFirst();

    if (existingDefaults && !force) {
        return {
            key: 'system-defaults',
            status: 'skipped',
            message: 'System defaults already exist',
            entityId: existingDefaults.id as number,
        };
    }

    if (dryRun) {
        return {
            key: 'system-defaults',
            status: existingDefaults ? 'updated' : 'created',
            message: `[DRY RUN] Would ${existingDefaults ? 'update' : 'create'} system defaults`,
        };
    }

    // Resolve provider and model IDs from keys
    const textProvider = await db.query.aiProviders.findFirst({
        where: eq(aiProviders.providerKey, SYSTEM_DEFAULTS_SEED.defaultTextProviderKey),
    });
    const embeddingProvider = await db.query.aiProviders.findFirst({
        where: eq(aiProviders.providerKey, SYSTEM_DEFAULTS_SEED.defaultEmbeddingProviderKey),
    });
    const chatProvider = await db.query.aiProviders.findFirst({
        where: eq(aiProviders.providerKey, SYSTEM_DEFAULTS_SEED.defaultChatProviderKey),
    });

    // Get model IDs: the seeded default when available, else an available model of the
    // same kind (Ollama's catalog is trimmed to what's installed on first boot)
    const textModel = textProvider
        ? await resolveDefaultModel(textProvider.id, SYSTEM_DEFAULTS_SEED.defaultTextModelKey, ['text', 'chat'])
        : null;

    const embeddingModel = embeddingProvider
        ? await resolveDefaultModel(embeddingProvider.id, SYSTEM_DEFAULTS_SEED.defaultEmbeddingModelKey, ['embedding'])
        : null;

    const chatModel = chatProvider
        ? await resolveDefaultModel(chatProvider.id, SYSTEM_DEFAULTS_SEED.defaultChatModelKey, ['chat'])
        : null;

    if (existingDefaults) {
        // Update existing defaults
        await db
            .update(systemDefaults)
            .set({
                defaultTextProviderId: textProvider?.id ?? null,
                defaultTextModelId: textModel?.id ?? null,
                defaultEmbeddingProviderId: embeddingProvider?.id ?? null,
                defaultEmbeddingModelId: embeddingModel?.id ?? null,
                defaultChatProviderId: chatProvider?.id ?? null,
                defaultChatModelId: chatModel?.id ?? null,
                updatedAt: new Date(),
            })
            .where(eq(systemDefaults.id, existingDefaults.id as number));

        logger.info('Updated system defaults');

        return {
            key: 'system-defaults',
            status: 'updated',
            message: 'Updated system defaults',
            entityId: existingDefaults.id as number,
        };
    }

    // Create new defaults
    const [created] = await db
        .insert(systemDefaults)
        .values({
            defaultTextProviderId: textProvider?.id ?? null,
            defaultTextModelId: textModel?.id ?? null,
            defaultEmbeddingProviderId: embeddingProvider?.id ?? null,
            defaultEmbeddingModelId: embeddingModel?.id ?? null,
            defaultChatProviderId: chatProvider?.id ?? null,
            defaultChatModelId: chatModel?.id ?? null,
        })
        .returning();

    logger.info('Created system defaults', { id: created.id });

    return {
        key: 'system-defaults',
        status: 'created',
        message: 'Created system defaults',
        entityId: created.id,
    };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Trim a freshly seeded Ollama catalog to the models actually installed. Best effort:
 * when Ollama isn't reachable the full starter catalog stays, and Discover models on
 * the AI Providers page trims it later.
 */
async function syncOllamaCatalog(providerId: string): Promise<void> {
    try {
        const result = await discoverOllamaModels(providerId, { timeoutMs: 3000 });
        logger.info('Synced Ollama catalog with installed models', {
            installed: result.modelsFound,
            hidden: result.modelsRemoved,
        });
    } catch (error) {
        logger.info('Ollama not reachable at first start — keeping the starter catalog', {
            reason: (error as Error).message,
        });
    }
}

/** A provider model as far as choosing a default is concerned. */
export interface DefaultCandidate {
    id: number;
    modelKey: string;
    modelType: string;
    isAvailable: boolean;
    sortOrder: number;
}

/**
 * The seeded default when it's available; otherwise the first available model of an
 * accepted type; otherwise the seeded default anyway (setup points defaults elsewhere).
 */
export function chooseDefaultModel<T extends DefaultCandidate>(
    models: T[],
    preferredKey: string,
    types: string[],
): T | null {
    const preferred = models.find((m) => m.modelKey === preferredKey) ?? null;
    if (preferred?.isAvailable) return preferred;
    const fallback = models
        .filter((m) => m.isAvailable && types.includes(m.modelType))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)[0];
    return fallback ?? preferred;
}

async function resolveDefaultModel(providerId: string, preferredKey: string, types: string[]) {
    const models = await db.query.aiProviderModels.findMany({
        where: eq(aiProviderModels.providerId, providerId),
    });
    return chooseDefaultModel(models as unknown as Array<DefaultCandidate & { id: number }>, preferredKey, types);
}

/**
 * Create a provider with its models from seed data
 */
async function createProviderFromSeed(seed: SeedAIProvider) {
    // Create provider
    const [provider] = await db
        .insert(aiProviders)
        .values({
            providerKey: seed.providerKey,
            displayName: seed.displayName,
            description: seed.description,
            providerType: seed.providerType,
            authType: seed.authType,
            baseUrl: seed.baseUrl,
            isEnabled: seed.isEnabled,
            settings: seed.settings,
        })
        .returning();

    // Create models
    if (seed.models.length > 0) {
        await db.insert(aiProviderModels).values(
            seed.models.map((model) => ({
                providerId: provider.id,
                modelKey: model.modelKey,
                displayName: model.displayName,
                description: model.description,
                modelType: model.modelType,
                dimensions: model.dimensions ?? null,
                capabilities: model.capabilities,
                isAvailable: true,
                isDiscovered: false,
                sortOrder: model.sortOrder,
            }))
        );
    }

    return provider;
}

// ============================================================================
// VERIFICATION
// ============================================================================

/**
 * Verify seeded AI providers exist and are valid
 */
export async function verifySeededProviders(): Promise<{
    valid: boolean;
    providers: Array<{
        key: string;
        exists: boolean;
        modelCount: number;
    }>;
    systemDefaultsExist: boolean;
}> {
    const providers: Array<{ key: string; exists: boolean; modelCount: number }> = [];

    for (const seedProvider of AI_PROVIDER_SEEDS) {
        const existing = await db.query.aiProviders.findFirst({
            where: eq(aiProviders.providerKey, seedProvider.providerKey),
            with: {
                models: true,
            },
        });

        providers.push({
            key: seedProvider.providerKey,
            exists: !!existing,
            modelCount: existing?.models?.length ?? 0,
        });
    }

    const defaults = await db.query.systemDefaults.findFirst();

    return {
        valid: providers.every((p) => p.exists) && !!defaults,
        providers,
        systemDefaultsExist: !!defaults,
    };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
    AI_PROVIDER_SEEDS,
    SYSTEM_DEFAULTS_SEED,
    getSeedProviderByKey,
    getAllSeedProviderKeys,
} from './ai-providers.seeds';

export type { SeedAIProvider, SeedAIModel } from './ai-providers.seeds';