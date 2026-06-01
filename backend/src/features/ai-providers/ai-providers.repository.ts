// src/features/ai-providers/ai-providers.repository.ts

/**
 * AI Providers Feature - Repository Layer
 * Raw database queries using Drizzle ORM
 */

import { eq, asc, and, count, SQL, sql, inArray } from 'drizzle-orm';
import { db } from '@/db/index';
import { aiProviders, aiProviderModels, systemDefaults } from '@/db/schema/ai-providers.schema';
import type {
    AIProvider,
    NewAIProvider,
    UpdateAIProvider,
    AIProviderModel,
    NewAIProviderModel,
    UpdateAIProviderModel,
    SystemDefaults,
    UpdateSystemDefaults,
    AIProviderWithModels,
    SystemDefaultsWithDetails,
} from '@/db/schema/ai-providers.schema';
import type { AIModelType, AIProviderType } from './ai-providers.types';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('ai-providers-repository');

// ============================================================================
// PROVIDER: CREATE OPERATIONS
// ============================================================================

/**
 * Create a new AI provider
 */
export async function createProvider(
    data: Omit<NewAIProvider, 'id' | 'createdAt' | 'updatedAt'>
): Promise<AIProvider> {
    try {
        const [created] = await db
            .insert(aiProviders)
            .values(data)
            .returning();

        logger.info('Created AI provider', {
            providerId: created.id,
            providerKey: created.providerKey,
        });

        return created;
    } catch (error) {
        logger.error('Failed to create AI provider', error as Error);
        throw error;
    }
}

/**
 * Create provider with models (transactional)
 */
export async function createProviderWithModels(
    providerData: Omit<NewAIProvider, 'id' | 'createdAt' | 'updatedAt'>,
    modelsData: Omit<NewAIProviderModel, 'id' | 'providerId' | 'createdAt' | 'updatedAt'>[]
): Promise<AIProviderWithModels> {
    return await db.transaction(async (tx) => {
        try {
            // Insert provider
            const [provider] = await tx
                .insert(aiProviders)
                .values(providerData)
                .returning();

            logger.info('Created AI provider in transaction', {
                providerId: provider.id,
                providerKey: provider.providerKey,
            });

            // Insert models
            let models: AIProviderModel[] = [];
            if (modelsData.length > 0) {
                models = await tx
                    .insert(aiProviderModels)
                    .values(
                        modelsData.map((model) => ({
                            ...model,
                            providerId: provider.id,
                        }))
                    )
                    .returning();

                logger.info('Created AI provider models', {
                    providerId: provider.id,
                    modelCount: models.length,
                });
            }

            return {
                ...provider,
                models,
            };
        } catch (error) {
            logger.error('Failed to create provider with models', error as Error);
            throw error;
        }
    });
}

// ============================================================================
// PROVIDER: READ OPERATIONS
// ============================================================================

/**
 * Get provider by ID
 */
export async function getProviderById(id: string): Promise<AIProvider | null> {
    try {
        const provider = await db.query.aiProviders.findFirst({
            where: eq(aiProviders.id, id),
        });

        return provider ?? null;
    } catch (error) {
        logger.error('Failed to get provider by ID', error as Error, { id });
        throw error;
    }
}

/**
 * Get provider by ID with models
 */
export async function getProviderByIdWithModels(
    id: string
): Promise<AIProviderWithModels | null> {
    try {
        const provider = await db.query.aiProviders.findFirst({
            where: eq(aiProviders.id, id),
            with: {
                models: {
                    orderBy: [asc(aiProviderModels.sortOrder), asc(aiProviderModels.displayName)],
                },
            },
        });

        return provider ?? null;
    } catch (error) {
        logger.error('Failed to get provider by ID with models', error as Error, { id });
        throw error;
    }
}

/**
 * Get provider by key
 */
export async function getProviderByKey(providerKey: string): Promise<AIProvider | null> {
    try {
        const provider = await db.query.aiProviders.findFirst({
            where: eq(aiProviders.providerKey, providerKey),
        });

        return provider ?? null;
    } catch (error) {
        logger.error('Failed to get provider by key', error as Error, { providerKey });
        throw error;
    }
}

/**
 * Get provider by key with models
 */
export async function getProviderByKeyWithModels(
    providerKey: string
): Promise<AIProviderWithModels | null> {
    try {
        const provider = await db.query.aiProviders.findFirst({
            where: eq(aiProviders.providerKey, providerKey),
            with: {
                models: {
                    orderBy: [asc(aiProviderModels.sortOrder), asc(aiProviderModels.displayName)],
                },
            },
        });

        return provider ?? null;
    } catch (error) {
        logger.error('Failed to get provider by key with models', error as Error, { providerKey });
        throw error;
    }
}

/**
 * List all providers
 */
export async function listProviders(options?: {
    isEnabled?: boolean;
    providerType?: AIProviderType;
}): Promise<AIProvider[]> {
    try {
        const conditions: SQL[] = [];

        if (options?.isEnabled !== undefined) {
            conditions.push(eq(aiProviders.isEnabled, options.isEnabled));
        }

        if (options?.providerType) {
            conditions.push(eq(aiProviders.providerType, options.providerType));
        }

        const providers = await db.query.aiProviders.findMany({
            where: conditions.length > 0 ? and(...conditions) : undefined,
            orderBy: [asc(aiProviders.displayName)],
        });

        return providers;
    } catch (error) {
        logger.error('Failed to list providers', error as Error, { options });
        throw error;
    }
}

/**
 * List all providers with models
 */
export async function listProvidersWithModels(options?: {
    isEnabled?: boolean;
    providerType?: AIProviderType;
}): Promise<AIProviderWithModels[]> {
    try {
        const conditions: SQL[] = [];

        if (options?.isEnabled !== undefined) {
            conditions.push(eq(aiProviders.isEnabled, options.isEnabled));
        }

        if (options?.providerType) {
            conditions.push(eq(aiProviders.providerType, options.providerType));
        }

        const providers = await db.query.aiProviders.findMany({
            where: conditions.length > 0 ? and(...conditions) : undefined,
            orderBy: [asc(aiProviders.displayName)],
            with: {
                models: {
                    orderBy: [asc(aiProviderModels.sortOrder), asc(aiProviderModels.displayName)],
                },
            },
        });

        return providers;
    } catch (error) {
        logger.error('Failed to list providers with models', error as Error, { options });
        throw error;
    }
}

/**
 * Check if provider key exists
 */
export async function providerKeyExists(
    providerKey: string,
    excludeId?: string
): Promise<boolean> {
    try {
        const conditions = [eq(aiProviders.providerKey, providerKey)];

        if (excludeId) {
            conditions.push(sql`${aiProviders.id} != ${excludeId}`);
        }

        const existing = await db.query.aiProviders.findFirst({
            where: and(...conditions),
            columns: { id: true },
        });

        return !!existing;
    } catch (error) {
        logger.error('Failed to check provider key existence', error as Error, { providerKey });
        throw error;
    }
}

// ============================================================================
// PROVIDER: UPDATE OPERATIONS
// ============================================================================

/**
 * Update a provider
 */
export async function updateProvider(
    id: string,
    data: UpdateAIProvider
): Promise<AIProvider> {
    try {
        const [updated] = await db
            .update(aiProviders)
            .set({
                ...data,
                updatedAt: new Date(),
            })
            .where(eq(aiProviders.id, id))
            .returning();

        if (!updated) {
            throw new Error(`Provider with ID ${id} not found`);
        }

        logger.info('Updated AI provider', {
            providerId: id,
            updatedFields: Object.keys(data),
        });

        return updated;
    } catch (error) {
        logger.error('Failed to update provider', error as Error, { id });
        throw error;
    }
}

/**
 * Update provider connection status
 */
export async function updateProviderConnectionStatus(
    id: string,
    status: string
): Promise<void> {
    try {
        await db
            .update(aiProviders)
            .set({
                lastConnectionCheck: new Date(),
                lastConnectionStatus: status,
                updatedAt: new Date(),
            })
            .where(eq(aiProviders.id, id));

        logger.debug('Updated provider connection status', { id, status });
    } catch (error) {
        logger.error('Failed to update connection status', error as Error, { id });
        throw error;
    }
}

// ============================================================================
// PROVIDER: DELETE OPERATIONS
// ============================================================================

/**
 * Delete a provider (cascades to models)
 */
export async function deleteProvider(id: string): Promise<void> {
    try {
        const result = await db
            .delete(aiProviders)
            .where(eq(aiProviders.id, id))
            .returning({ id: aiProviders.id });

        if (result.length === 0) {
            throw new Error(`Provider with ID ${id} not found`);
        }

        logger.info('Deleted AI provider', { providerId: id });
    } catch (error) {
        logger.error('Failed to delete provider', error as Error, { id });
        throw error;
    }
}

// ============================================================================
// MODEL: CREATE OPERATIONS
// ============================================================================

/**
 * Create a new model
 */
export async function createModel(
    data: Omit<NewAIProviderModel, 'id' | 'createdAt' | 'updatedAt'>
): Promise<AIProviderModel> {
    try {
        const [created] = await db
            .insert(aiProviderModels)
            .values(data)
            .returning();

        logger.info('Created AI model', {
            modelId: created.id,
            modelKey: created.modelKey,
            providerId: created.providerId,
        });

        return created;
    } catch (error) {
        logger.error('Failed to create AI model', error as Error);
        throw error;
    }
}

/**
 * Create multiple models (batch)
 */
export async function createModels(
    models: Omit<NewAIProviderModel, 'id' | 'createdAt' | 'updatedAt'>[]
): Promise<AIProviderModel[]> {
    if (models.length === 0) return [];

    try {
        const created = await db
            .insert(aiProviderModels)
            .values(models)
            .returning();

        logger.info('Created AI models batch', {
            count: created.length,
            providerId: models[0].providerId,
        });

        return created;
    } catch (error) {
        logger.error('Failed to create AI models batch', error as Error);
        throw error;
    }
}

// ============================================================================
// MODEL: READ OPERATIONS
// ============================================================================

/**
 * Get model by ID
 */
export async function getModelById(id: number): Promise<AIProviderModel | null> {
    try {
        const model = await db.query.aiProviderModels.findFirst({
            where: eq(aiProviderModels.id, id),
        });

        return model ?? null;
    } catch (error) {
        logger.error('Failed to get model by ID', error as Error, { id });
        throw error;
    }
}

/**
 * Get model by ID with provider info
 */
export async function getModelByIdWithProvider(id: number): Promise<
    (AIProviderModel & { provider: AIProvider }) | null
> {
    try {
        const model = await db.query.aiProviderModels.findFirst({
            where: eq(aiProviderModels.id, id),
            with: {
                provider: true,
            },
        });

        return model ?? null;
    } catch (error) {
        logger.error('Failed to get model by ID with provider', error as Error, { id });
        throw error;
    }
}

/**
 * Get model by provider ID and model key
 */
export async function getModelByProviderAndKey(
    providerId: string,
    modelKey: string
): Promise<AIProviderModel | null> {
    try {
        const model = await db.query.aiProviderModels.findFirst({
            where: and(
                eq(aiProviderModels.providerId, providerId),
                eq(aiProviderModels.modelKey, modelKey)
            ),
        });

        return model ?? null;
    } catch (error) {
        logger.error('Failed to get model by provider and key', error as Error, {
            providerId,
            modelKey,
        });
        throw error;
    }
}

/**
 * List models for a provider
 */
export async function listModelsByProvider(
    providerId: string,
    options?: {
        modelType?: AIModelType;
        isAvailable?: boolean;
    }
): Promise<AIProviderModel[]> {
    try {
        const conditions: SQL[] = [eq(aiProviderModels.providerId, providerId)];

        if (options?.modelType) {
            conditions.push(eq(aiProviderModels.modelType, options.modelType));
        }

        if (options?.isAvailable !== undefined) {
            conditions.push(eq(aiProviderModels.isAvailable, options.isAvailable));
        }

        const models = await db.query.aiProviderModels.findMany({
            where: and(...conditions),
            orderBy: [asc(aiProviderModels.sortOrder), asc(aiProviderModels.displayName)],
        });

        return models;
    } catch (error) {
        logger.error('Failed to list models by provider', error as Error, { providerId, options });
        throw error;
    }
}

/**
 * List all models with optional filters
 */
export async function listModels(options?: {
    providerId?: string;
    providerKey?: string;
    modelType?: AIModelType;
    isAvailable?: boolean;
}): Promise<AIProviderModel[]> {
    try {
        const conditions: SQL[] = [];

        if (options?.providerId) {
            conditions.push(eq(aiProviderModels.providerId, options.providerId));
        }

        if (options?.modelType) {
            conditions.push(eq(aiProviderModels.modelType, options.modelType));
        }

        if (options?.isAvailable !== undefined) {
            conditions.push(eq(aiProviderModels.isAvailable, options.isAvailable));
        }

        // If providerKey is specified, we need a subquery or join
        if (options?.providerKey) {
            const provider = await getProviderByKey(options.providerKey);
            if (!provider) {
                return []; // Provider not found, return empty
            }
            conditions.push(eq(aiProviderModels.providerId, provider.id));
        }

        const models = await db.query.aiProviderModels.findMany({
            where: conditions.length > 0 ? and(...conditions) : undefined,
            orderBy: [asc(aiProviderModels.sortOrder), asc(aiProviderModels.displayName)],
        });

        return models;
    } catch (error) {
        logger.error('Failed to list models', error as Error, { options });
        throw error;
    }
}

/**
 * List models with provider info (for dropdowns)
 */
export async function listModelsWithProvider(options?: {
    modelType?: AIModelType;
    isAvailable?: boolean;
    enabledProvidersOnly?: boolean;
}): Promise<(AIProviderModel & { provider: AIProvider })[]> {
    try {
        // First, get provider IDs if filtering by enabled
        let providerIds: string[] | undefined;
        if (options?.enabledProvidersOnly) {
            const enabledProviders = await listProviders({ isEnabled: true });
            providerIds = enabledProviders.map((p) => p.id);
            if (providerIds.length === 0) {
                return []; // No enabled providers
            }
        }

        const conditions: SQL[] = [];

        if (options?.modelType) {
            conditions.push(eq(aiProviderModels.modelType, options.modelType));
        }

        if (options?.isAvailable !== undefined) {
            conditions.push(eq(aiProviderModels.isAvailable, options.isAvailable));
        }

        if (providerIds && providerIds.length > 0) {
            conditions.push(inArray(aiProviderModels.providerId, providerIds));
        }

        const models = await db.query.aiProviderModels.findMany({
            where: conditions.length > 0 ? and(...conditions) : undefined,
            orderBy: [asc(aiProviderModels.sortOrder), asc(aiProviderModels.displayName)],
            with: {
                provider: true,
            },
        });

        return models as (AIProviderModel & { provider: AIProvider })[];
    } catch (error) {
        logger.error('Failed to list models with provider', error as Error, { options });
        throw error;
    }
}

/**
 * Check if model key exists for a provider
 */
export async function modelKeyExists(
    providerId: string,
    modelKey: string,
    excludeId?: number
): Promise<boolean> {
    try {
        const conditions = [
            eq(aiProviderModels.providerId, providerId),
            eq(aiProviderModels.modelKey, modelKey),
        ];

        if (excludeId) {
            conditions.push(sql`${aiProviderModels.id} != ${excludeId}`);
        }

        const existing = await db.query.aiProviderModels.findFirst({
            where: and(...conditions),
            columns: { id: true },
        });

        return !!existing;
    } catch (error) {
        logger.error('Failed to check model key existence', error as Error, { providerId, modelKey });
        throw error;
    }
}

// ============================================================================
// MODEL: UPDATE OPERATIONS
// ============================================================================

/**
 * Update a model
 */
export async function updateModel(
    id: number,
    data: UpdateAIProviderModel
): Promise<AIProviderModel> {
    try {
        const [updated] = await db
            .update(aiProviderModels)
            .set({
                ...data,
                updatedAt: new Date(),
            })
            .where(eq(aiProviderModels.id, id))
            .returning();

        if (!updated) {
            throw new Error(`Model with ID ${id} not found`);
        }

        logger.info('Updated AI model', {
            modelId: id,
            updatedFields: Object.keys(data),
        });

        return updated;
    } catch (error) {
        logger.error('Failed to update model', error as Error, { id });
        throw error;
    }
}

/**
 * Update model availability
 */
export async function updateModelAvailability(
    id: number,
    isAvailable: boolean
): Promise<void> {
    try {
        await db
            .update(aiProviderModels)
            .set({
                isAvailable,
                updatedAt: new Date(),
            })
            .where(eq(aiProviderModels.id, id));

        logger.debug('Updated model availability', { id, isAvailable });
    } catch (error) {
        logger.error('Failed to update model availability', error as Error, { id });
        throw error;
    }
}

/**
 * Mark all models for a provider as unavailable
 */
export async function markAllModelsUnavailable(providerId: string): Promise<number> {
    try {
        const result = await db
            .update(aiProviderModels)
            .set({
                isAvailable: false,
                updatedAt: new Date(),
            })
            .where(eq(aiProviderModels.providerId, providerId))
            .returning({ id: aiProviderModels.id });

        logger.info('Marked all models unavailable', {
            providerId,
            count: result.length,
        });

        return result.length;
    } catch (error) {
        logger.error('Failed to mark models unavailable', error as Error, { providerId });
        throw error;
    }
}

// ============================================================================
// MODEL: DELETE OPERATIONS
// ============================================================================

/**
 * Delete a model
 */
export async function deleteModel(id: number): Promise<void> {
    try {
        const result = await db
            .delete(aiProviderModels)
            .where(eq(aiProviderModels.id, id))
            .returning({ id: aiProviderModels.id });

        if (result.length === 0) {
            throw new Error(`Model with ID ${id} not found`);
        }

        logger.info('Deleted AI model', { modelId: id });
    } catch (error) {
        logger.error('Failed to delete model', error as Error, { id });
        throw error;
    }
}

/**
 * Delete all discovered models for a provider (for re-discovery)
 */
export async function deleteDiscoveredModels(providerId: string): Promise<number> {
    try {
        const result = await db
            .delete(aiProviderModels)
            .where(
                and(
                    eq(aiProviderModels.providerId, providerId),
                    eq(aiProviderModels.isDiscovered, true)
                )
            )
            .returning({ id: aiProviderModels.id });

        logger.info('Deleted discovered models', {
            providerId,
            count: result.length,
        });

        return result.length;
    } catch (error) {
        logger.error('Failed to delete discovered models', error as Error, { providerId });
        throw error;
    }
}

// ============================================================================
// SYSTEM DEFAULTS: READ/WRITE OPERATIONS
// ============================================================================

/**
 * Get system defaults (creates if not exists)
 * Uses direct select to avoid relation type inference issues
 */
export async function getSystemDefaults(): Promise<SystemDefaults> {
    try {
        // Use select instead of db.query to get base type without relations
        const results = await db
            .select()
            .from(systemDefaults)
            .limit(1);

        if (results.length === 0) {
            // Create default record
            const [created] = await db
                .insert(systemDefaults)
                .values({})
                .returning();
            logger.info('Created system defaults record', { id: created.id });
            return created;
        }

        return results[0];
    } catch (error) {
        logger.error('Failed to get system defaults', error as Error);
        throw error;
    }
}

/**
 * Get system defaults with resolved provider/model details
 */
export async function getSystemDefaultsWithDetails(): Promise<SystemDefaultsWithDetails> {
    try {
        const defaults = await getSystemDefaults();

        // Fetch related entities
        const [
            textProvider,
            textModel,
            embeddingProvider,
            embeddingModel,
            chatProvider,
            chatModel,
        ] = await Promise.all([
            defaults.defaultTextProviderId
                ? getProviderById(defaults.defaultTextProviderId)
                : null,
            defaults.defaultTextModelId
                ? getModelById(defaults.defaultTextModelId)
                : null,
            defaults.defaultEmbeddingProviderId
                ? getProviderById(defaults.defaultEmbeddingProviderId)
                : null,
            defaults.defaultEmbeddingModelId
                ? getModelById(defaults.defaultEmbeddingModelId)
                : null,
            defaults.defaultChatProviderId
                ? getProviderById(defaults.defaultChatProviderId)
                : null,
            defaults.defaultChatModelId
                ? getModelById(defaults.defaultChatModelId)
                : null,
        ]);

        return {
            ...defaults,
            defaultTextProvider: textProvider,
            defaultTextModel: textModel,
            defaultEmbeddingProvider: embeddingProvider,
            defaultEmbeddingModel: embeddingModel,
            defaultChatProvider: chatProvider,
            defaultChatModel: chatModel,
        };
    } catch (error) {
        logger.error('Failed to get system defaults with details', error as Error);
        throw error;
    }
}

/**
 * Update system defaults
 */
export async function updateSystemDefaults(
    data: UpdateSystemDefaults
): Promise<SystemDefaults> {
    try {
        const current = await getSystemDefaults();

        const [updated] = await db
            .update(systemDefaults)
            .set({
                ...data,
                updatedAt: new Date(),
            })
            .where(eq(systemDefaults.id, current.id))
            .returning();

        logger.info('Updated system defaults', {
            id: current.id,
            updatedFields: Object.keys(data),
        });

        return updated;
    } catch (error) {
        logger.error('Failed to update system defaults', error as Error);
        throw error;
    }
}

/**
 * Set a specific default (helper function)
 */
export async function setDefault(
    purpose: 'text' | 'embedding' | 'chat',
    providerId: string | null,
    modelId: number | null
): Promise<SystemDefaults> {
    const updateData: UpdateSystemDefaults = {};

    switch (purpose) {
        case 'text':
            updateData.defaultTextProviderId = providerId;
            updateData.defaultTextModelId = modelId;
            break;
        case 'embedding':
            updateData.defaultEmbeddingProviderId = providerId;
            updateData.defaultEmbeddingModelId = modelId;
            break;
        case 'chat':
            updateData.defaultChatProviderId = providerId;
            updateData.defaultChatModelId = modelId;
            break;
    }

    return updateSystemDefaults(updateData);
}

// ============================================================================
// STATISTICS / COUNTS
// ============================================================================

/**
 * Get provider count
 */
export async function getProviderCount(isEnabled?: boolean): Promise<number> {
    try {
        const conditions = isEnabled !== undefined
            ? eq(aiProviders.isEnabled, isEnabled)
            : undefined;

        const [result] = await db
            .select({ count: count() })
            .from(aiProviders)
            .where(conditions);

        return result?.count ?? 0;
    } catch (error) {
        logger.error('Failed to get provider count', error as Error);
        throw error;
    }
}

/**
 * Get model count for a provider
 */
export async function getModelCount(
    providerId: string,
    isAvailable?: boolean
): Promise<number> {
    try {
        const conditions = [eq(aiProviderModels.providerId, providerId)];

        if (isAvailable !== undefined) {
            conditions.push(eq(aiProviderModels.isAvailable, isAvailable));
        }

        const [result] = await db
            .select({ count: count() })
            .from(aiProviderModels)
            .where(and(...conditions));

        return result?.count ?? 0;
    } catch (error) {
        logger.error('Failed to get model count', error as Error, { providerId });
        throw error;
    }
}