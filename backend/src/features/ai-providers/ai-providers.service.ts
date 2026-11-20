// src/features/ai-providers/ai-providers.service.ts

/**
 * AI Providers Feature - Service Layer
 * Business logic, caching, type transformations, and integrations
 */

import * as repository from './ai-providers.repository';
import type {
  // DTOs from validation
  CreateAIProviderInput,
  UpdateAIProviderInput,
  CreateAIModelInput,
  UpdateAIModelInput,
  UpdateSystemDefaultsInput,
  ListProvidersQueryInput,
  ListModelsQueryInput,
  GetModelsForPurposeQueryInput,
  // Response types
  AIProviderResponse,
  AIProviderWithModelsResponse,
  AIProviderModelResponse,
  AIModelWithProviderResponse,
  SystemDefaultsResponse,
  ResolvedSystemDefaults,
  ConnectionTestResult,
  ModelDiscoveryResult,
  OllamaTagsResponse,
  OllamaModelInfo,
  // Database types
  AIProvider,
  AIProviderModel,
  AIProviderWithModels,
  NewAIProvider,
  NewAIProviderModel,
  AIModelType,
} from './ai-providers.types';
import { defaultConnectionType, type AIConnectionType } from './ai-providers.validation';
import { canShortenVectorsByDefault } from './shortenable-embeddings';

import { ollamaHeaders } from '@/features/ai-service/adapters/ollama-headers';
import { AdapterError, errorFromResponse, noAnswerError } from '@/features/ai-service/adapters/types';
import { AIServiceError } from '@/features/ai-service/ai-service.types';
import { CacheManager } from '@/shared/cache/cache-manager';
import { fetchOnSameServer } from '@/shared/http/same-server-fetch';
import { createLogger } from '@/shared/logger/logger';


const logger = createLogger('ai-providers-service');

// Cache TTL - 5 minutes default
// Note: Add aiProviders to cacheConfig.features if you want to configure this
const AI_PROVIDERS_CACHE_TTL = 300;

const cache = new CacheManager('ai-providers', {
  defaultTTL: AI_PROVIDERS_CACHE_TTL,
});

// ============================================================================
// TYPE MAPPERS (Transform API DTOs to Repository types)
// ============================================================================

/**
 * Map provider DTO to database insert type
 */
function mapProviderDtoToInsert(
  input: CreateAIProviderInput
): Omit<NewAIProvider, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    providerKey: input.providerKey,
    displayName: input.displayName,
    description: input.description ?? null,
    providerType: input.providerType,
    connectionType: input.connectionType ?? defaultConnectionType(input.providerKey),
    authType: input.authType,
    baseUrl: input.baseUrl,
    // No authentication, no key: a typed one would otherwise be sent. An empty one is no key.
    apiKey: input.authType === 'none' || !input.apiKey?.trim() ? null : input.apiKey,
    isEnabled: input.isEnabled ?? false,
    settings: input.settings ?? {},
  };
}

/**
 * Map model DTO to database insert type
 */
function mapModelDtoToInsert(
  input: CreateAIModelInput,
  providerId: string
): Omit<NewAIProviderModel, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    providerId,
    modelKey: input.modelKey,
    displayName: input.displayName,
    description: input.description ?? null,
    modelType: input.modelType,
    dimensions: input.dimensions ?? null,
    canShortenVectors: input.canShortenVectors ?? canShortenVectorsByDefault(input.modelKey, input.modelType),
    capabilities: input.capabilities ?? {},
    isAvailable: input.isAvailable ?? true,
    isDiscovered: input.isDiscovered ?? false,
    sortOrder: input.sortOrder ?? 0,
    inputCostPerMillionTokens: input.inputCostPerMillionTokens ?? null,
    outputCostPerMillionTokens: input.outputCostPerMillionTokens ?? null,
  };
}

/**
 * Map database provider to API response (hide sensitive data)
 */
function mapProviderToResponse(provider: AIProvider): AIProviderResponse {
  return {
    id: provider.id,
    providerKey: provider.providerKey,
    displayName: provider.displayName,
    description: provider.description,
    providerType: provider.providerType as AIProviderResponse['providerType'],
    connectionType: provider.connectionType,
    authType: provider.authType as AIProviderResponse['authType'],
    baseUrl: provider.baseUrl,
    hasApiKey: !!provider.apiKey, // Don't expose actual key
    isEnabled: provider.isEnabled,
    settings: provider.settings ?? {},
    lastConnectionCheck: provider.lastConnectionCheck,
    lastConnectionStatus: provider.lastConnectionStatus,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
  };
}

/**
 * Map database model to API response
 */
function mapModelToResponse(model: AIProviderModel): AIProviderModelResponse {
  return {
    id: model.id,
    providerId: model.providerId,
    modelKey: model.modelKey,
    displayName: model.displayName,
    description: model.description,
    modelType: model.modelType as AIModelType,
    dimensions: model.dimensions,
    canShortenVectors: model.canShortenVectors,
    capabilities: model.capabilities ?? {},
    isAvailable: model.isAvailable,
    isDiscovered: model.isDiscovered,
    sortOrder: model.sortOrder,
    inputCostPerMillionTokens: model.inputCostPerMillionTokens,
    outputCostPerMillionTokens: model.outputCostPerMillionTokens,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
  };
}

/**
 * Map provider with models to API response
 */
function mapProviderWithModelsToResponse(
  provider: AIProviderWithModels
): AIProviderWithModelsResponse {
  const models = provider.models.map(mapModelToResponse);
  return {
    ...mapProviderToResponse(provider),
    models,
    modelCount: models.length,
    enabledModelCount: models.filter((m) => m.isAvailable).length,
  };
}

// ============================================================================
// CACHE HELPERS
// ============================================================================

async function clearProviderCache(providerId?: string, providerKey?: string): Promise<void> {
  const keys: string[] = ['providers:list', 'providers:list:with-models', 'system-defaults'];

  if (providerId) {
    keys.push(
      `provider:${providerId}`,
      `provider:${providerId}:with-models`,
      `provider:config:${providerId}` // Internal config cache
    );
  }
  if (providerKey) {
    keys.push(`provider:key:${providerKey}`, `provider:key:${providerKey}:with-models`);
  }

  await Promise.all(keys.map((key) => cache.delete(key)));
}

async function clearModelCache(providerId: string): Promise<void> {
  await Promise.all([
    cache.delete(`models:provider:${providerId}`),
    cache.delete(`provider:${providerId}:with-models`),
    cache.delete('providers:list:with-models'),
  ]);
}

async function clearSystemDefaultsCache(): Promise<void> {
  await Promise.all([
    cache.delete('system-defaults'),
    cache.delete('system-defaults:resolved'),
  ]);
}

export async function clearAllCache(): Promise<void> {
  await cache.clear();
  logger.info('Cleared all AI providers cache');
}

export function getCacheStats() {
  return cache.getStats();
}

// ============================================================================
// PROVIDER: CREATE OPERATIONS
// ============================================================================

/**
 * Create a new AI provider
 */
export async function createProvider(
  input: CreateAIProviderInput
): Promise<AIProviderResponse> {
  try {
    // Check if provider key already exists
    const exists = await repository.providerKeyExists(input.providerKey);
    if (exists) {
      throw new Error(`Provider with key "${input.providerKey}" already exists`);
    }

    // Create provider
    const provider = await repository.createProvider(mapProviderDtoToInsert(input));

    await clearProviderCache();

    logger.info('Created AI provider', {
      providerId: provider.id,
      providerKey: provider.providerKey,
    });

    return mapProviderToResponse(provider);
  } catch (error) {
    logger.error('Failed to create AI provider', error as Error);
    throw error;
  }
}

/**
 * Create provider with initial models
 */
export async function createProviderWithModels(
  input: CreateAIProviderInput,
  models: CreateAIModelInput[]
): Promise<AIProviderWithModelsResponse> {
  try {
    // Check if provider key already exists
    const exists = await repository.providerKeyExists(input.providerKey);
    if (exists) {
      throw new Error(`Provider with key "${input.providerKey}" already exists`);
    }

    // We need to create provider first to get its ID
    const providerData = mapProviderDtoToInsert(input);

    // Use transaction to create provider and models together
    const result = await repository.createProviderWithModels(
      providerData,
      models.map((m) => mapModelDtoToInsert(m, '')) // providerId will be set in transaction
    );

    await clearProviderCache();

    logger.info('Created AI provider with models', {
      providerId: result.id,
      providerKey: result.providerKey,
      modelCount: result.models.length,
    });

    return mapProviderWithModelsToResponse(result);
  } catch (error) {
    logger.error('Failed to create AI provider with models', error as Error);
    throw error;
  }
}

// ============================================================================
// PROVIDER: READ OPERATIONS
// ============================================================================

/**
 * Get provider by ID
 */
export async function getProviderById(id: string): Promise<AIProviderResponse | null> {
  return cache.getOrSet(
    `provider:${id}`,
    async () => {
      const provider = await repository.getProviderById(id);
      if (!provider) return null;
      return mapProviderToResponse(provider);
    }
  );
}

/**
 * A saved key this server can't decrypt (SECRETS_ENCRYPTION_KEY changed or missing) reads
 * as no key. Callers about to use the key ask this first, so the admin is told the cause
 * instead of the provider refusing a request sent without one. Null when the key is fine.
 */
export async function unreadableKeyError(
  provider: Pick<AIProvider, 'id' | 'providerKey' | 'displayName' | 'authType' | 'apiKey'>
): Promise<AIServiceError | null> {
  // Only a provider set to use a key can have one saved (no authentication removes it)
  if (provider.apiKey || provider.authType !== 'api_key') return null;
  try {
    if (!(await repository.storedKeyIsUnreadable(provider.id))) return null;
  } catch (error) {
    // The check is only there to name the cause: the call goes ahead as it did before
    logger.warn('Could not check whether a saved AI provider key can be decrypted', { providerId: provider.id, error: (error as Error).message });
    return null;
  }
  return new AIServiceError(
    `The saved API key for "${provider.displayName}" can't be decrypted with this server's encryption key. ` +
      'Restore the previous SECRETS_ENCRYPTION_KEY, or enter the API key again on the AI Providers page.',
    'PROVIDER_KEY_UNREADABLE',
    provider.id,
    provider.providerKey
  );
}

/**
 * Get raw provider config by ID (internal use only - includes apiKey)
 *
 * This function returns the full provider record including sensitive data like apiKey.
 * It should only be used internally by the AI service layer, not exposed via API handlers.
 */
export async function getProviderConfigById(id: string): Promise<AIProvider | null> {
  return cache.getOrSet(
    `provider:config:${id}`,
    async () => {
      return repository.getProviderById(id);
    }
  );
}

/**
 * Get provider by ID with models
 */
export async function getProviderByIdWithModels(
  id: string
): Promise<AIProviderWithModelsResponse | null> {
  return cache.getOrSet(
    `provider:${id}:with-models`,
    async () => {
      const provider = await repository.getProviderByIdWithModels(id);
      if (!provider) return null;
      return mapProviderWithModelsToResponse(provider);
    }
  );
}

/**
 * Get provider by key
 */
export async function getProviderByKey(
  providerKey: string
): Promise<AIProviderResponse | null> {
  return cache.getOrSet(
    `provider:key:${providerKey}`,
    async () => {
      const provider = await repository.getProviderByKey(providerKey);
      if (!provider) return null;
      return mapProviderToResponse(provider);
    }
  );
}

/**
 * Get provider by key with models
 */
export async function getProviderByKeyWithModels(
  providerKey: string
): Promise<AIProviderWithModelsResponse | null> {
  return cache.getOrSet(
    `provider:key:${providerKey}:with-models`,
    async () => {
      const provider = await repository.getProviderByKeyWithModels(providerKey);
      if (!provider) return null;
      return mapProviderWithModelsToResponse(provider);
    }
  );
}

/**
 * List all providers
 */
export async function listProviders(
  query?: ListProvidersQueryInput
): Promise<AIProviderResponse[] | AIProviderWithModelsResponse[]> {
  const cacheKey = query?.includeModels
    ? 'providers:list:with-models'
    : 'providers:list';

  return cache.getOrSet(
    cacheKey,
    async () => {
      if (query?.includeModels) {
        const providers = await repository.listProvidersWithModels({
          isEnabled: query.isEnabled,
          providerType: query.providerType,
        });
        return providers.map(mapProviderWithModelsToResponse);
      }

      const providers = await repository.listProviders({
        isEnabled: query?.isEnabled,
        providerType: query?.providerType,
      });
      return providers.map(mapProviderToResponse);
    }
  );
}

/**
 * Get enabled providers only (common use case)
 */
export async function getEnabledProviders(): Promise<AIProviderWithModelsResponse[]> {
  return cache.getOrSet(
    'providers:enabled:with-models',
    async () => {
      const providers = await repository.listProvidersWithModels({ isEnabled: true });
      return providers.map(mapProviderWithModelsToResponse);
    }
  );
}

// ============================================================================
// PROVIDER: UPDATE OPERATIONS
// ============================================================================

/** The server a base URL reaches (scheme, host and port), or the URL itself when it can't be read. */
function serverOf(baseUrl: string): string {
  try { return new URL(baseUrl).origin; } catch { return baseUrl; }
}

/** A provider moved to another server without its API key typed again. */
export class KeyForAnotherServerError extends Error {
  constructor() {
    super('Enter the API key again: the new base URL is on a different server than the one the saved key was entered for');
    this.name = 'KeyForAnotherServerError';
  }
}

/**
 * Update a provider
 */
export async function updateProvider(
  id: string,
  input: UpdateAIProviderInput
): Promise<AIProviderResponse> {
  try {
    // Check if provider exists
    const existing = await repository.getProviderById(id);
    if (!existing) {
      throw new Error(`Provider with ID "${id}" not found`);
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (input.displayName !== undefined) updateData.displayName = input.displayName;
    if (input.description !== undefined) updateData.description = input.description ?? null;
    if (input.baseUrl !== undefined) updateData.baseUrl = input.baseUrl;
    if (input.connectionType !== undefined) updateData.connectionType = input.connectionType;
    if (input.authType !== undefined) updateData.authType = input.authType;
    // No authentication: the saved key goes too, or requests would still carry it
    const dropsKey = input.authType === 'none';
    // An empty key keeps the saved one (the form sends one when nothing was typed); null removes it
    const newKey = !dropsKey && typeof input.apiKey === 'string' && input.apiKey.trim() !== '' ? input.apiKey : undefined;
    if (newKey !== undefined) updateData.apiKey = newKey;
    else if (input.apiKey === null || dropsKey) updateData.apiKey = null;
    // A saved key goes only to the server it was entered for: another server needs it typed again.
    // One this server can't decrypt still counts as saved: it would work again once the key is restored.
    const hasSavedKey = !!existing.apiKey || (existing.authType === 'api_key' && await repository.storedKeyIsUnreadable(id));
    if (input.baseUrl !== undefined && hasSavedKey && newKey === undefined && updateData.apiKey !== null
        && serverOf(input.baseUrl) !== serverOf(existing.baseUrl)) {
      throw new KeyForAnotherServerError();
    }
    if (input.isEnabled !== undefined) updateData.isEnabled = input.isEnabled;
    if (input.settings !== undefined) updateData.settings = input.settings;

    const updated = await repository.updateProvider(id, updateData);

    await clearProviderCache(id, existing.providerKey);

    logger.info('Updated AI provider', {
      providerId: id,
      updatedFields: Object.keys(input),
    });

    return mapProviderToResponse(updated);
  } catch (error) {
    // A key to type again is the admin's to fix: the handler answers it, nothing failed here
    if (!(error instanceof KeyForAnotherServerError)) logger.error('Failed to update AI provider', error as Error, { id });
    throw error;
  }
}

/**
 * Enable or disable a provider
 */
export async function setProviderEnabled(
  id: string,
  isEnabled: boolean
): Promise<AIProviderResponse> {
  return updateProvider(id, { isEnabled });
}

// ============================================================================
// PROVIDER: DELETE OPERATIONS
// ============================================================================

/**
 * Delete a provider
 */
export async function deleteProvider(id: string): Promise<void> {
  try {
    const existing = await repository.getProviderById(id);
    if (!existing) {
      throw new Error(`Provider with ID "${id}" not found`);
    }

    await repository.deleteProvider(id);
    await clearProviderCache(id, existing.providerKey);
    await clearSystemDefaultsCache(); // Defaults might reference this provider

    logger.info('Deleted AI provider', {
      providerId: id,
      providerKey: existing.providerKey,
    });
  } catch (error) {
    logger.error('Failed to delete AI provider', error as Error, { id });
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
  input: CreateAIModelInput
): Promise<AIProviderModelResponse> {
  try {
    // Verify provider exists
    const provider = await repository.getProviderById(input.providerId);
    if (!provider) {
      throw new Error(`Provider with ID "${input.providerId}" not found`);
    }

    // Check if model key already exists for this provider
    const exists = await repository.modelKeyExists(input.providerId, input.modelKey);
    if (exists) {
      throw new Error(
        `Model with key "${input.modelKey}" already exists for provider "${provider.providerKey}"`
      );
    }

    const model = await repository.createModel(mapModelDtoToInsert(input, input.providerId));
    await clearModelCache(input.providerId);

    logger.info('Created AI model', {
      modelId: model.id,
      modelKey: model.modelKey,
      providerId: input.providerId,
    });

    return mapModelToResponse(model);
  } catch (error) {
    logger.error('Failed to create AI model', error as Error);
    throw error;
  }
}

// ============================================================================
// MODEL: READ OPERATIONS
// ============================================================================

/**
 * Get model by ID
 */
export async function getModelById(id: number): Promise<AIProviderModelResponse | null> {
  const model = await repository.getModelById(id);
  if (!model) return null;
  return mapModelToResponse(model);
}

/**
 * Get model by ID with provider info
 */
export async function getModelByIdWithProvider(
  id: number
): Promise<AIModelWithProviderResponse | null> {
  const model = await repository.getModelByIdWithProvider(id);
  if (!model) return null;

  return {
    ...mapModelToResponse(model),
    provider: {
      id: model.provider.id,
      providerKey: model.provider.providerKey,
      displayName: model.provider.displayName,
      isEnabled: model.provider.isEnabled,
    },
  };
}

/**
 * List models with optional filters
 */
export async function listModels(
  query?: ListModelsQueryInput
): Promise<AIProviderModelResponse[]> {
  const models = await repository.listModels({
    providerId: query?.providerId,
    providerKey: query?.providerKey,
    modelType: query?.modelType,
    isAvailable: query?.isAvailable,
  });

  return models.map(mapModelToResponse);
}

/**
 * List models with provider info (for dropdowns)
 */
export async function listModelsWithProvider(
  query?: ListModelsQueryInput
): Promise<AIModelWithProviderResponse[]> {
  const models = await repository.listModelsWithProvider({
    modelType: query?.modelType,
    isAvailable: query?.isAvailable,
    enabledProvidersOnly: true,
  });

  return models.map((model) => ({
    ...mapModelToResponse(model),
    provider: {
      id: model.provider.id,
      providerKey: model.provider.providerKey,
      displayName: model.provider.displayName,
      isEnabled: model.provider.isEnabled,
    },
  }));
}

/**
 * Get models suitable for a specific purpose
 */
export async function getModelsForPurpose(
  query: GetModelsForPurposeQueryInput
): Promise<AIModelWithProviderResponse[]> {
  // Map purpose to model type
  const modelType: AIModelType = query.purpose === 'embedding' ? 'embedding' : 'chat';

  return listModelsWithProvider({
    modelType,
    isAvailable: true,
    includeProvider: false,
  });
}

// ============================================================================
// MODEL: UPDATE OPERATIONS
// ============================================================================

/**
 * Update a model
 */
export async function updateModel(
  id: number,
  input: UpdateAIModelInput
): Promise<AIProviderModelResponse> {
  try {
    const existing = await repository.getModelById(id);
    if (!existing) {
      throw new Error(`Model with ID "${id}" not found`);
    }

    const updateData: Record<string, unknown> = {};

    if (input.displayName !== undefined) updateData.displayName = input.displayName;
    if (input.description !== undefined) updateData.description = input.description ?? null;
    if (input.dimensions !== undefined) updateData.dimensions = input.dimensions ?? null;
    if (input.canShortenVectors !== undefined) updateData.canShortenVectors = input.canShortenVectors;
    if (input.capabilities !== undefined) updateData.capabilities = input.capabilities;
    if (input.isAvailable !== undefined) updateData.isAvailable = input.isAvailable;
    // Switched on or off by an admin: discovery leaves it as set from now on. An edit that sends
    // the same value (the form sends every field) keeps discovery's own hiding
    if (input.isAvailable !== undefined && input.isAvailable !== existing.isAvailable) updateData.hiddenByDiscovery = false;
    if (input.sortOrder !== undefined) updateData.sortOrder = input.sortOrder;
    if (input.inputCostPerMillionTokens !== undefined) updateData.inputCostPerMillionTokens = input.inputCostPerMillionTokens;
    if (input.outputCostPerMillionTokens !== undefined) updateData.outputCostPerMillionTokens = input.outputCostPerMillionTokens;

    const updated = await repository.updateModel(id, updateData);
    await clearModelCache(existing.providerId);

    logger.info('Updated AI model', {
      modelId: id,
      updatedFields: Object.keys(input),
    });

    return mapModelToResponse(updated);
  } catch (error) {
    logger.error('Failed to update AI model', error as Error, { id });
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
    const existing = await repository.getModelById(id);
    if (!existing) {
      throw new Error(`Model with ID "${id}" not found`);
    }

    await repository.deleteModel(id);
    await clearModelCache(existing.providerId);
    await clearSystemDefaultsCache(); // Defaults might reference this model

    logger.info('Deleted AI model', {
      modelId: id,
      modelKey: existing.modelKey,
    });
  } catch (error) {
    logger.error('Failed to delete AI model', error as Error, { id });
    throw error;
  }
}

// ============================================================================
// SYSTEM DEFAULTS
// ============================================================================

/**
 * Get system defaults with resolved details
 */
export async function getSystemDefaults(): Promise<SystemDefaultsResponse> {
  return cache.getOrSet(
    'system-defaults',
    async () => {
      const defaults = await repository.getSystemDefaultsWithDetails();

      return {
        id: String(defaults.id),
        defaultTextProviderId: defaults.defaultTextProviderId,
        defaultTextModelId: defaults.defaultTextModelId,
        defaultTextProvider: defaults.defaultTextProvider
          ? mapProviderToResponse(defaults.defaultTextProvider)
          : null,
        defaultTextModel: defaults.defaultTextModel
          ? mapModelToResponse(defaults.defaultTextModel)
          : null,
        defaultEmbeddingProviderId: defaults.defaultEmbeddingProviderId,
        defaultEmbeddingModelId: defaults.defaultEmbeddingModelId,
        defaultEmbeddingProvider: defaults.defaultEmbeddingProvider
          ? mapProviderToResponse(defaults.defaultEmbeddingProvider)
          : null,
        defaultEmbeddingModel: defaults.defaultEmbeddingModel
          ? mapModelToResponse(defaults.defaultEmbeddingModel)
          : null,
        defaultChatProviderId: defaults.defaultChatProviderId,
        defaultChatModelId: defaults.defaultChatModelId,
        defaultChatProvider: defaults.defaultChatProvider
          ? mapProviderToResponse(defaults.defaultChatProvider)
          : null,
        defaultChatModel: defaults.defaultChatModel
          ? mapModelToResponse(defaults.defaultChatModel)
          : null,
        updatedAt: defaults.updatedAt,
      };
    }
  );
}

/**
 * Get simplified resolved defaults (for common use)
 */
export async function getResolvedDefaults(): Promise<ResolvedSystemDefaults> {
  return cache.getOrSet(
    'system-defaults:resolved',
    async () => {
      const defaults = await repository.getSystemDefaultsWithDetails();

      return {
        text: {
          providerId: defaults.defaultTextProviderId,
          providerKey: defaults.defaultTextProvider?.providerKey ?? null,
          modelId: defaults.defaultTextModelId,
          modelKey: defaults.defaultTextModel?.modelKey ?? null,
        },
        embedding: {
          providerId: defaults.defaultEmbeddingProviderId,
          providerKey: defaults.defaultEmbeddingProvider?.providerKey ?? null,
          modelId: defaults.defaultEmbeddingModelId,
          modelKey: defaults.defaultEmbeddingModel?.modelKey ?? null,
          dimensions: defaults.defaultEmbeddingModel?.dimensions ?? null,
        },
        chat: {
          providerId: defaults.defaultChatProviderId,
          providerKey: defaults.defaultChatProvider?.providerKey ?? null,
          modelId: defaults.defaultChatModelId,
          modelKey: defaults.defaultChatModel?.modelKey ?? null,
        },
      };
    }
  );
}

/**
 * Update system defaults
 */
export async function updateSystemDefaults(
  input: UpdateSystemDefaultsInput
): Promise<SystemDefaultsResponse> {
  try {
    // Validate that referenced providers/models exist
    if (input.defaultTextProviderId) {
      const provider = await repository.getProviderById(input.defaultTextProviderId);
      if (!provider) {
        throw new Error(`Text provider with ID "${input.defaultTextProviderId}" not found`);
      }
    }
    if (input.defaultTextModelId) {
      const model = await repository.getModelById(input.defaultTextModelId);
      if (!model) {
        throw new Error(`Text model with ID "${input.defaultTextModelId}" not found`);
      }
    }
    // Similar validation for embedding and chat...

    await repository.updateSystemDefaults({
      defaultTextProviderId: input.defaultTextProviderId,
      defaultTextModelId: input.defaultTextModelId,
      defaultEmbeddingProviderId: input.defaultEmbeddingProviderId,
      defaultEmbeddingModelId: input.defaultEmbeddingModelId,
      defaultChatProviderId: input.defaultChatProviderId,
      defaultChatModelId: input.defaultChatModelId,
    });

    await clearSystemDefaultsCache();

    logger.info('Updated system defaults', { input });

    return getSystemDefaults();
  } catch (error) {
    logger.error('Failed to update system defaults', error as Error);
    throw error;
  }
}

/**
 * Set default for a specific purpose
 */
export async function setDefaultForPurpose(
  purpose: 'text' | 'embedding' | 'chat',
  providerId: string | null,
  modelId: number | null
): Promise<SystemDefaultsResponse> {
  try {
    // Validate if setting (not clearing)
    if (providerId) {
      const provider = await repository.getProviderById(providerId);
      if (!provider) {
        throw new Error(`Provider with ID "${providerId}" not found`);
      }
    }
    if (modelId) {
      const model = await repository.getModelById(modelId);
      if (!model) {
        throw new Error(`Model with ID "${modelId}" not found`);
      }
    }

    await repository.setDefault(purpose, providerId, modelId);
    await clearSystemDefaultsCache();

    logger.info('Set default for purpose', { purpose, providerId, modelId });

    return getSystemDefaults();
  } catch (error) {
    logger.error('Failed to set default for purpose', error as Error, { purpose });
    throw error;
  }
}

// ============================================================================
// CONNECTION TESTING
// ============================================================================

/**
 * Test provider connection
 */
export async function testConnection(providerId: string): Promise<ConnectionTestResult> {
  const startTime = Date.now();

  try {
    const provider = await repository.getProviderById(providerId);
    if (!provider) {
      throw new Error(`Provider with ID "${providerId}" not found`);
    }

    let result: ConnectionTestResult;

    const keyError = await unreadableKeyError(provider);
    if (keyError) {
      result = { providerId, providerKey: provider.providerKey, success: false, message: keyError.message, responseTimeMs: 0, testedAt: new Date() };
    } else if (connectionTypeOf(provider) === 'ollama') {
      result = await testOllamaConnection(provider);
    } else {
      result = await testOpenAICompatibleConnection(provider);
    }

    // Update connection status in database
    await repository.updateProviderConnectionStatus(
      providerId,
      result.success ? 'connected' : `error: ${result.message}`
    );

    return result;
  } catch (error) {
    const errorMessage = (error as Error).message;

    await repository.updateProviderConnectionStatus(providerId, `error: ${errorMessage}`);

    return {
      providerId,
      providerKey: 'unknown',
      success: false,
      message: errorMessage,
      responseTimeMs: Date.now() - startTime,
      testedAt: new Date(),
    };
  }
}

async function testOllamaConnection(provider: AIProvider): Promise<ConnectionTestResult> {
  const startTime = Date.now();

  try {
    const response = await fetchOnSameServer(`${provider.baseUrl}/api/tags`, {
      method: 'GET',
      headers: ollamaHeaders(provider.apiKey),
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    const responseTimeMs = Date.now() - startTime;

    if (!response.ok) {
      return {
        providerId: provider.id,
        providerKey: provider.providerKey,
        success: false,
        message: `HTTP ${response.status}: ${response.statusText}`,
        responseTimeMs,
        testedAt: new Date(),
      };
    }

    const data = (await response.json()) as OllamaTagsResponse;

    return {
      providerId: provider.id,
      providerKey: provider.providerKey,
      success: true,
      message: 'Connected successfully',
      responseTimeMs,
      details: {
        modelsAvailable: data.models?.length ?? 0,
      },
      testedAt: new Date(),
    };
  } catch (error) {
    return {
      providerId: provider.id,
      providerKey: provider.providerKey,
      success: false,
      message: (error as Error).message,
      responseTimeMs: Date.now() - startTime,
      details: {
        error: (error as Error).message,
      },
      testedAt: new Date(),
    };
  }
}

async function testOpenAICompatibleConnection(provider: AIProvider): Promise<ConnectionTestResult> {
  const startTime = Date.now();

  if (provider.authType === 'api_key' && !provider.apiKey) {
    return {
      providerId: provider.id,
      providerKey: provider.providerKey,
      success: false,
      message: 'API key is required: this provider is set to use one',
      responseTimeMs: 0,
      testedAt: new Date(),
    };
  }

  try {
    const response = await fetchOnSameServer(`${provider.baseUrl}/models`, {
      method: 'GET',
      headers: provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {},
      signal: AbortSignal.timeout(10000),
    });

    const responseTimeMs = Date.now() - startTime;

    if (!response.ok) {
      const errorBody = await response.text();
      return {
        providerId: provider.id,
        providerKey: provider.providerKey,
        success: false,
        message: `HTTP ${response.status}: ${errorBody}`,
        responseTimeMs,
        testedAt: new Date(),
      };
    }

    return {
      providerId: provider.id,
      providerKey: provider.providerKey,
      success: true,
      message: 'Connected successfully',
      responseTimeMs,
      testedAt: new Date(),
    };
  } catch (error) {
    return {
      providerId: provider.id,
      providerKey: provider.providerKey,
      success: false,
      message: (error as Error).message,
      responseTimeMs: Date.now() - startTime,
      testedAt: new Date(),
    };
  }
}


// ============================================================================
// OLLAMA MODEL DISCOVERY
// ============================================================================

/** The connection type of a provider, also one stored or cached before connection types existed. */
export function connectionTypeOf(provider: Pick<AIProvider, 'providerKey'> & { connectionType?: AIConnectionType | null }): AIConnectionType {
  return provider.connectionType ?? defaultConnectionType(provider.providerKey);
}

/**
 * What a provider reports through its own API: the models to save, every model key it lists
 * (also ones not saved, such as speech models), and which saved models it may hide when it
 * stops listing them.
 */
interface ProviderReport {
  models: ReportedModel[];
  listed: string[];
  /** Ollama: anything not installed. An OpenAI-compatible service: only models discovery added. */
  hides: 'all' | 'discovered' | 'none';
  /** A new embedding model's vector size, when the provider doesn't report it with the list */
  dimensionsOf?: (modelKey: string) => Promise<number | null>;
}

/** A model a provider reports through its own API, ready to save. */
interface ReportedModel {
  modelKey: string;
  modelType: AIModelType;
  description: string;
  dimensions: number | null;
  capabilities: Record<string, unknown>;
}

/**
 * Discover a provider's models from its own API (Ollama's installed models, or an
 * OpenAI-compatible /models list) and save them: new ones are added, saved ones keep their
 * on/off state (an admin switches them on), and models it no longer lists are hidden as the
 * provider's report says.
 */
export async function discoverModels(
  providerId: string,
  options: { timeoutMs?: number } = {}
): Promise<ModelDiscoveryResult> {
  try {
    const provider = await repository.getProviderById(providerId);
    if (!provider) {
      throw new Error(`Provider with ID "${providerId}" not found`);
    }
    const keyError = await unreadableKeyError(provider);
    if (keyError) throw keyError;
    const timeoutMs = options.timeoutMs ?? 30000;
    const report = connectionTypeOf(provider) === 'ollama'
      ? await readOllamaModels(provider, timeoutMs)
      : await readOpenAICompatibleModels(provider, timeoutMs);
    // A cloud service lists far more than an experience needs: new models wait for the admin
    const result = await saveDiscoveredModels(providerId, report, { addOff: provider.providerType === 'cloud' });
    logger.info('Completed model discovery', { providerId, ...result });
    return result;
  } catch (error) {
    logger.error('Failed to discover models', error as Error, { providerId });
    throw error;
  }
}

/**
 * A provider's model list as JSON (null when the answer isn't JSON). A refusal or no answer is
 * thrown as the provider's own error, named and with its status, so the admin is told what
 * happened (the key was rejected, the service couldn't be reached) rather than a bare failure.
 */
async function readModelList(provider: AIProvider, path: string, headers: Record<string, string>, timeoutMs: number): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchOnSameServer(`${provider.baseUrl}${path}`, { method: 'GET', headers, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw noAnswerError(error, provider.providerKey);
  }
  if (!response.ok) {
    // OpenAI-style answers say why in error.message, Ollama's in error
    throw await errorFromResponse(response, provider.providerKey, (body) => {
      const error = (body as { error?: unknown } | null)?.error;
      return typeof error === 'string' ? error : (error as { message?: string } | undefined)?.message;
    });
  }
  return response.json().catch(() => null);
}

async function readOllamaModels(provider: AIProvider, timeoutMs: number): Promise<ProviderReport> {
  const data = ((await readModelList(provider, '/api/tags', ollamaHeaders(provider.apiKey), timeoutMs)) ?? {}) as OllamaTagsResponse;
  const installed = data.models || [];
  // Each model's details; capabilities are in the list on newer Ollama, in /api/show from 0.6.4
  const shown = await inBatches(installed, 4, (ollamaModel) => ollamaShown(provider, ollamaModel.name));
  const usable = installed
    .map((ollamaModel, i) => ({
      ollamaModel,
      shown: shown[i],
      modelType: ollamaModelType({ ...ollamaModel, capabilities: ollamaModel.capabilities ?? shown[i].capabilities }),
    }))
    .filter((m): m is { ollamaModel: OllamaModelInfo; shown: OllamaShown; modelType: AIModelType } => m.modelType !== 'skip');
  const models = usable.map(({ ollamaModel, modelType, shown: details }): ReportedModel => ({
    modelKey: ollamaModel.name,
    modelType,
    description: `Discovered from Ollama (${ollamaModel.details.parameter_size})`,
    dimensions: modelType === 'embedding' ? details.embeddingLength ?? inferEmbeddingDimensions(ollamaModel) : null,
    capabilities: {
      parameterSize: ollamaModel.details.parameter_size,
      quantization: ollamaModel.details.quantization_level,
      family: ollamaModel.details.family,
      ...(details.contextLength !== undefined && { contextWindow: details.contextLength }),
    },
  }));
  // What Ollama has installed is the truth: every other model is hidden, seeded ones included
  // An empty list (nothing pulled yet, or Ollama restarting) hides nothing
  return { models, listed: installed.map((m) => m.name), hides: installed.length === 0 ? 'none' : 'all' };
}

/**
 * A model's type as Ollama states it (its capabilities: "embedding", "completion"); a model
 * that does neither (an image or "decision" model) is skipped. An Ollama too old to list
 * capabilities leaves the name to decide.
 */
function ollamaModelType(model: OllamaModelInfo): AIModelType | 'skip' {
  const capabilities = model.capabilities;
  if (!Array.isArray(capabilities) || capabilities.length === 0) return inferModelType(model);
  if (capabilities.includes('embedding')) return 'embedding';
  return capabilities.includes('completion') ? 'chat' : 'skip';
}

/** What Ollama's /api/show tells about a model */
interface OllamaShown { capabilities?: string[]; contextLength?: number; embeddingLength?: number }

/**
 * A model's capabilities, context size and vector size from Ollama's /api/show, the sizes read
 * under the model's own architecture ("qwen2.context_length"), not a vision tower's. Empty
 * when Ollama won't say.
 */
async function ollamaShown(provider: AIProvider, model: string): Promise<OllamaShown> {
  try {
    const response = await fetchOnSameServer(`${provider.baseUrl}/api/show`, {
      method: 'POST',
      headers: ollamaHeaders(provider.apiKey, true),
      body: JSON.stringify({ model }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return {};
    const body = (await response.json()) as { capabilities?: unknown; model_info?: Record<string, unknown> };
    const capabilities = Array.isArray(body.capabilities) ? body.capabilities.filter((c): c is string => typeof c === 'string') : undefined;
    const info = body.model_info ?? {};
    const architecture = info['general.architecture'];
    if (typeof architecture !== 'string') return { capabilities };
    const size = (key: string) => {
      const value = info[`${architecture}.${key}`];
      return typeof value === 'number' && value > 0 ? value : undefined;
    };
    return { capabilities, contextLength: size('context_length'), embeddingLength: size('embedding_length') };
  } catch {
    return {};
  }
}

/** fn over items, a few at a time, results in order */
async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    results.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  }
  return results;
}

/**
 * A model's type as an OpenAI-compatible list states it, when it does: a capabilities object
 * (embeddings, chat_completion: Azure OpenAI and some gateways) or output modalities
 * (OpenRouter). Undefined when the list says nothing, and the id decides.
 */
function listedModelType(model: Record<string, unknown>): AIModelType | 'skip' | undefined {
  const capabilities = model.capabilities;
  if (capabilities && typeof capabilities === 'object' && !Array.isArray(capabilities)) {
    const said = capabilities as Record<string, unknown>;
    if (said.embeddings === true) return 'embedding';
    if (said.chat_completion === true) return 'chat';
    if (said.chat_completion === false) return 'skip';
  }
  const architecture = model.architecture as { output_modalities?: unknown } | undefined;
  const modalities = model.output_modalities ?? architecture?.output_modalities;
  if (Array.isArray(modalities)) {
    if (modalities.includes('embeddings')) return 'embedding';
    return modalities.includes('text') ? 'chat' : 'skip';
  }
  return undefined;
}

/** Model ids that read as embedding models: "embed" in the name, or a well-known embedding family. */
const EMBEDDING_MODEL = /(embed|\bbge\b|\bbge-|\be5-|\bgte-|minilm|mxbai|sentence-transformers)/i;

/** Model ids an OpenAI-compatible list carries that aren't text or embedding models. */
const NOT_TEXT_MODEL = /(whisper|tts|dall-e|gpt-image|image|audio|realtime|transcribe|moderation|speech|sora|rerank|ocr)/i;

/**
 * OpenAI text models that don't answer /chat/completions (completions-only or Responses-only),
 * also behind a router's "openai/" prefix. Other "-instruct" models (Llama, Qwen) do chat.
 */
const NOT_CHAT_MODEL = /(^|\/)(babbage-|davinci-|gpt-3\.5-turbo-instruct|o1-pro|o3-pro|computer-use)/i;

/** A context size some gateways report beside each model (vLLM max_model_len, others context_length). */
function reportedContextWindow(model: Record<string, unknown>): number | undefined {
  const value = model.context_length ?? model.max_model_len ?? model.context_window;
  return typeof value === 'number' && value > 0 ? value : undefined;
}

async function readOpenAICompatibleModels(provider: AIProvider, timeoutMs: number): Promise<ProviderReport> {
  const body = (await readModelList(provider, '/models', provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}, timeoutMs)) as { data?: unknown } | null;
  // An answer that isn't a model list (a proxy's page, a changed API) says nothing about the models
  if (!body || !Array.isArray(body.data)) {
    throw new AdapterError('The answer is not an OpenAI-style model list (no "data" list)', provider.providerKey, undefined, false);
  }
  const listed = (body.data as Array<Record<string, unknown>>)
    .filter((model): model is Record<string, unknown> & { id: string } => typeof model.id === 'string' && model.id.length > 0);
  // A model's type is what the list says about it; when it says nothing, the id decides. A model
  // that is neither a text nor an embedding model is not added (it can be added by hand)
  const typed = listed.map((model) => ({
    model,
    modelType: listedModelType(model)
      ?? (NOT_TEXT_MODEL.test(model.id) || NOT_CHAT_MODEL.test(model.id) ? 'skip' : EMBEDDING_MODEL.test(model.id) ? 'embedding' : 'chat'),
  }));
  const models = typed
    .filter((t): t is { model: (typeof listed)[number]; modelType: AIModelType } => t.modelType !== 'skip')
    .map(({ model, modelType }): ReportedModel => {
      const contextWindow = reportedContextWindow(model);
      return {
        modelKey: model.id,
        modelType,
        description: `Discovered from ${provider.displayName}`,
        dimensions: null,
        capabilities: contextWindow ? { contextWindow } : {},
      };
    });
  // A service can list fewer models than are saved (models added by hand, aliases it serves
  // unlisted): only models an earlier discovery added are hidden when it stops listing them
  return {
    models,
    listed: listed.map((m) => m.id),
    // An empty list hides nothing: a service between restarts can briefly list no models
    hides: listed.length === 0 ? 'none' : 'discovered',
    // One short embedding tells the size; only on a self-hosted service, where it costs nothing
    ...(provider.providerType === 'local' && { dimensionsOf: (key: string) => embeddingDimensions(provider, key) }),
  };
}

/** An embedding model's vector size, from one short embedding; null when the service won't say. */
async function embeddingDimensions(provider: AIProvider, modelKey: string): Promise<number | null> {
  try {
    const response = await fetchOnSameServer(`${provider.baseUrl}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(provider.apiKey && { Authorization: `Bearer ${provider.apiKey}` }) },
      body: JSON.stringify({ model: modelKey, input: 'dimensions' }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { data?: Array<{ embedding?: unknown }> };
    const vector = body.data?.[0]?.embedding;
    return Array.isArray(vector) && vector.length > 0 ? vector.length : null;
  } catch {
    return null;
  }
}

/**
 * Save the models a provider reported: new ones are added (switched off when `addOff`, for the
 * admin to choose), and saved ones it no longer lists are hidden as its report says. A saved
 * model it lists gains the context size it reports when it has none; one discovery hid is
 * switched back on, while one an admin switched off (or that was added off) stays off and is
 * named in `leftOff`.
 * Ollama reports "name:latest" for a model saved as "name".
 */
async function saveDiscoveredModels(providerId: string, report: ProviderReport, options: { addOff?: boolean } = {}): Promise<ModelDiscoveryResult> {
  const reported = report.models;
  const existingModels = await repository.listModelsByProvider(providerId);
  const sameModel = (key: string) => key.replace(/:latest$/, '');
  const existingByKey = new Map(existingModels.map((m) => [sameModel(m.modelKey), m]));

  let modelsAdded = 0;
  let modelsUpdated = 0;
  const errors: string[] = [];
  const needsSetup: string[] = [];
  const leftOff: string[] = [];
  const addedOff: string[] = [];

  for (const model of reported) {
    try {
      const existing = existingByKey.get(sameModel(model.modelKey));
      if (existing) {
        const caps = (existing.capabilities ?? {}) as Record<string, unknown>;
        const reportedWindow = model.capabilities.contextWindow as number | undefined;
        // Discovery switches back on only what it hid itself; an admin's choice stays
        const comesBack = !existing.isAvailable && existing.hiddenByDiscovery;
        if (!existing.isAvailable && !comesBack) leftOff.push(existing.modelKey);
        await repository.updateModel(existing.id, {
          ...(comesBack && { isAvailable: true, hiddenByDiscovery: false }),
          // Only discovery's own models are hidden when an OpenAI-compatible service stops listing
          // them, so a saved model it lists keeps its origin there; for Ollama every model is its
          ...(report.hides === 'all' && { isDiscovered: true }),
          ...(reportedWindow !== undefined && caps.contextWindow === undefined && { capabilities: { ...caps, contextWindow: reportedWindow } }),
        });
        modelsUpdated++;
      } else {
        const dimensions = model.dimensions
          ?? (model.modelType === 'embedding' && report.dimensionsOf ? await report.dimensionsOf(model.modelKey) : null);
        if (model.modelType === 'embedding' && dimensions === null) {
          needsSetup.push(`${model.modelKey}: set its dimensions on the model`);
        }
        await repository.createModel({
          providerId,
          modelKey: model.modelKey,
          displayName: formatModelDisplayName(model.modelKey),
          description: model.description,
          modelType: model.modelType,
          dimensions,
          canShortenVectors: canShortenVectorsByDefault(model.modelKey, model.modelType),
          capabilities: model.capabilities,
          isAvailable: !options.addOff,
          isDiscovered: true,
          sortOrder: 100, // Discovered models at the end
        });
        if (options.addOff) addedOff.push(model.modelKey);
        modelsAdded++;
      }
    } catch (error) {
      errors.push(`Failed to process model ${model.modelKey}: ${(error as Error).message}`);
    }
  }

  const listedKeys = new Set(report.listed.map(sameModel));
  const modelsToMarkUnavailable = existingModels.filter(
    (m) => m.isAvailable && !listedKeys.has(sameModel(m.modelKey))
      && (report.hides === 'all' || (report.hides === 'discovered' && m.isDiscovered))
  );
  for (const model of modelsToMarkUnavailable) {
    await repository.updateModelAvailability(model.id, false, true);
  }

  await clearModelCache(providerId);

  return {
    success: errors.length === 0,
    modelsFound: reported.length,
    modelsAdded,
    modelsUpdated,
    modelsRemoved: modelsToMarkUnavailable.length,
    errors,
    needsSetup,
    leftOff,
    addedOff,
  };
}

/**
 * Infer model type from Ollama model info
 */
function inferModelType(model: OllamaModelInfo): AIModelType {
  const name = model.name.toLowerCase();
  const family = (model.details.family || '').toLowerCase();

  // Check for embedding models
  if (
    name.includes('embed') ||
    name.includes('nomic') ||
    name.includes('mxbai') ||
    family.includes('embed')
  ) {
    return 'embedding';
  }

  // Default to chat for most models
  return 'chat';
}

/**
 * Infer embedding dimensions from model name
 */
function inferEmbeddingDimensions(model: OllamaModelInfo): number | null {
  const name = model.name.toLowerCase();

  // Known embedding model dimensions
  if (name.includes('nomic-embed-text')) return 768;
  if (name.includes('mxbai-embed-large')) return 1024;
  if (name.includes('all-minilm')) return 384;

  return null;
}

/**
 * Format an Ollama model key as a display name in the style of the seeded catalog:
 * "gemma3:12b" → "Gemma 3 12B", "qwen2.5:14b" → "Qwen 2.5 14B",
 * "nomic-embed-text:latest" → "Nomic Embed Text".
 */
export function formatModelDisplayName(modelKey: string): string {
  return modelKey
    .replace(/:latest$/, '')
    .split(/[-_:]/)
    .filter(Boolean)
    .map((word) => {
      if (/^\d+(\.\d+)?[bm]$/i.test(word)) return word.toUpperCase(); // parameter size
      const versioned = /^([a-z]+)(\d[\d.]*)$/i.exec(word); // family + version
      const [name, version] = versioned ? [versioned[1], versioned[2]] : [word, ''];
      return name.charAt(0).toUpperCase() + name.slice(1) + (version ? ` ${version}` : '');
    })
    .join(' ');
}