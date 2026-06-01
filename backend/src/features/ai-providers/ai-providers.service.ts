// src/features/ai-providers/ai-providers.service.ts

/**
 * AI Providers Feature - Service Layer
 * Business logic, caching, type transformations, and integrations
 */

import { CacheManager } from '@/shared/cache/cache-manager';
import { createLogger } from '@/shared/logger/logger';
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
  OllamaDiscoveryResult,
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
    authType: input.authType,
    baseUrl: input.baseUrl,
    apiKey: input.apiKey ?? null,
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
    if (input.apiKey !== undefined) updateData.apiKey = input.apiKey ?? null;
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
    logger.error('Failed to update AI provider', error as Error, { id });
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
    if (input.capabilities !== undefined) updateData.capabilities = input.capabilities;
    if (input.isAvailable !== undefined) updateData.isAvailable = input.isAvailable;
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

    // Test based on provider type
    if (provider.providerKey === 'ollama') {
      result = await testOllamaConnection(provider);
    } else if (provider.providerKey === 'openai') {
      result = await testOpenAIConnection(provider);
    } else {
      // Generic HTTP test
      result = await testGenericConnection(provider);
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
    const response = await fetch(`${provider.baseUrl}/api/tags`, {
      method: 'GET',
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

async function testOpenAIConnection(provider: AIProvider): Promise<ConnectionTestResult> {
  const startTime = Date.now();

  if (!provider.apiKey) {
    return {
      providerId: provider.id,
      providerKey: provider.providerKey,
      success: false,
      message: 'API key is required for OpenAI',
      responseTimeMs: 0,
      testedAt: new Date(),
    };
  }

  try {
    const response = await fetch(`${provider.baseUrl}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
      },
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

async function testGenericConnection(provider: AIProvider): Promise<ConnectionTestResult> {
  const startTime = Date.now();

  try {
    const response = await fetch(provider.baseUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10000),
    });

    const responseTimeMs = Date.now() - startTime;

    return {
      providerId: provider.id,
      providerKey: provider.providerKey,
      success: response.ok,
      message: response.ok ? 'Connected successfully' : `HTTP ${response.status}`,
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

/**
 * Discover models from Ollama
 */
export async function discoverOllamaModels(
  providerId: string
): Promise<OllamaDiscoveryResult> {
  try {
    const provider = await repository.getProviderById(providerId);
    if (!provider) {
      throw new Error(`Provider with ID "${providerId}" not found`);
    }

    if (provider.providerKey !== 'ollama') {
      throw new Error('Model discovery is only supported for Ollama provider');
    }

    // Fetch models from Ollama API
    const response = await fetch(`${provider.baseUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: HTTP ${response.status}`);
    }

    const data = (await response.json()) as OllamaTagsResponse;
    const discoveredModels = data.models || [];

    // Get existing models
    const existingModels = await repository.listModelsByProvider(providerId);
    const existingModelKeys = new Set(existingModels.map((m) => m.modelKey));

    let modelsAdded = 0;
    let modelsUpdated = 0;
    const errors: string[] = [];

    // Process discovered models
    for (const ollamaModel of discoveredModels) {
      try {
        const modelKey = ollamaModel.name;
        const modelType = inferModelType(ollamaModel);

        if (existingModelKeys.has(modelKey)) {
          // Update existing model
          const existing = existingModels.find((m) => m.modelKey === modelKey);
          if (existing) {
            await repository.updateModel(existing.id, {
              isAvailable: true,
              isDiscovered: true,
            });
            modelsUpdated++;
          }
        } else {
          // Create new model
          await repository.createModel({
            providerId,
            modelKey,
            displayName: formatModelDisplayName(modelKey),
            description: `Discovered from Ollama (${ollamaModel.details.parameter_size})`,
            modelType,
            dimensions: modelType === 'embedding' ? inferEmbeddingDimensions(ollamaModel) : null,
            capabilities: {
              parameterSize: ollamaModel.details.parameter_size,
              quantization: ollamaModel.details.quantization_level,
              family: ollamaModel.details.family,
            },
            isAvailable: true,
            isDiscovered: true,
            sortOrder: 100, // Discovered models at the end
          });
          modelsAdded++;
        }
      } catch (error) {
        errors.push(`Failed to process model ${ollamaModel.name}: ${(error as Error).message}`);
      }
    }

    // Mark models that are no longer available
    const discoveredKeys = new Set(discoveredModels.map((m) => m.name));
    const modelsToMarkUnavailable = existingModels.filter(
      (m) => m.isDiscovered && !discoveredKeys.has(m.modelKey)
    );

    for (const model of modelsToMarkUnavailable) {
      await repository.updateModelAvailability(model.id, false);
    }

    await clearModelCache(providerId);

    const result: OllamaDiscoveryResult = {
      success: errors.length === 0,
      modelsFound: discoveredModels.length,
      modelsAdded,
      modelsUpdated,
      modelsRemoved: modelsToMarkUnavailable.length,
      errors,
    };

    logger.info('Completed Ollama model discovery', {
      providerId,
      ...result,
    });

    return result;
  } catch (error) {
    logger.error('Failed to discover Ollama models', error as Error, { providerId });
    throw error;
  }
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
 * Format model key to display name
 */
function formatModelDisplayName(modelKey: string): string {
  return modelKey
    .split(/[-_:]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}