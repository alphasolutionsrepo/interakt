// src/features/ai-providers/ai-providers.api.handlers.ts

/**
 * AI Providers Feature - API Handlers
 * HTTP request/response handling, validation, and error handling
 */

import { NextRequest } from 'next/server';
import { apiResponse } from '@/shared/api/response';
import { createLogger } from '@/shared/logger/logger';
import { getCurrentUserId } from '@/shared/utils/auth-utils';
import * as service from './ai-providers.service';
import {
  createAIProviderSchema,
  updateAIProviderSchema,
  createAIModelSchema,
  updateAIModelSchema,
  updateSystemDefaultsSchema,
  setDefaultBodySchema,
  listProvidersQuerySchema,
  listModelsQuerySchema,
  getModelsForPurposeQuerySchema,
  providerIdSchema,
  modelIdSchema,
} from './ai-providers.validation';

const logger = createLogger('ai-providers-handlers');

// ============================================================================
// PROVIDER: CREATE HANDLERS
// ============================================================================

/**
 * POST /api/ai-providers
 * Create a new AI provider
 */
export async function handleCreateProvider(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return apiResponse.unauthorized('You must be logged in to create providers');
    }

    const body = await request.json();
    const validation = createAIProviderSchema.safeParse(body);

    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const provider = await service.createProvider(validation.data);

    logger.info('Created AI provider via API', {
      providerId: provider.id,
      userId,
    });

    return apiResponse.success(provider, 201);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to create AI provider', err);

    if (err.message.includes('already exists')) {
      return apiResponse.badRequest(err.message);
    }

    return apiResponse.error(err);
  }
}

// ============================================================================
// PROVIDER: READ HANDLERS
// ============================================================================

/**
 * GET /api/ai-providers
 * List all AI providers
 */
export async function handleListProviders(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = {
      isEnabled: searchParams.get('isEnabled') === 'true' ? true : 
                 searchParams.get('isEnabled') === 'false' ? false : undefined,
      providerType: searchParams.get('providerType') || undefined,
      includeModels: searchParams.get('includeModels') === 'true',
    };

    const validation = listProvidersQuerySchema.safeParse(query);
    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const providers = await service.listProviders(validation.data);

    return apiResponse.success(providers);
  } catch (error) {
    logger.error('Failed to list AI providers', error as Error);
    return apiResponse.error(error as Error);
  }
}

/**
 * GET /api/ai-providers/:id
 * Get a single AI provider by ID
 */
export async function handleGetProvider(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const validation = providerIdSchema.safeParse({ id: params.id });

    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const includeModels = request.nextUrl.searchParams.get('includeModels') === 'true';

    const provider = includeModels
      ? await service.getProviderByIdWithModels(validation.data.id)
      : await service.getProviderById(validation.data.id);

    if (!provider) {
      return apiResponse.notFound(`Provider with ID "${validation.data.id}" not found`);
    }

    return apiResponse.success(provider);
  } catch (error) {
    logger.error('Failed to get AI provider', error as Error);
    return apiResponse.error(error as Error);
  }
}

/**
 * GET /api/ai-providers/key/:providerKey
 * Get a provider by key
 */
export async function handleGetProviderByKey(
  request: NextRequest,
  context: { params: Promise<{ providerKey: string }> }
) {
  try {
    const params = await context.params;
    const providerKey = params.providerKey;

    if (!providerKey) {
      return apiResponse.badRequest('Provider key is required');
    }

    const includeModels = request.nextUrl.searchParams.get('includeModels') === 'true';

    const provider = includeModels
      ? await service.getProviderByKeyWithModels(providerKey)
      : await service.getProviderByKey(providerKey);

    if (!provider) {
      return apiResponse.notFound(`Provider with key "${providerKey}" not found`);
    }

    return apiResponse.success(provider);
  } catch (error) {
    logger.error('Failed to get AI provider by key', error as Error);
    return apiResponse.error(error as Error);
  }
}

/**
 * GET /api/ai-providers/enabled
 * Get only enabled providers with models
 */
export async function handleGetEnabledProviders() {
  try {
    const providers = await service.getEnabledProviders();
    return apiResponse.success(providers);
  } catch (error) {
    logger.error('Failed to get enabled providers', error as Error);
    return apiResponse.error(error as Error);
  }
}

// ============================================================================
// PROVIDER: UPDATE HANDLERS
// ============================================================================

/**
 * PUT /api/ai-providers/:id
 * Update an AI provider
 */
export async function handleUpdateProvider(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return apiResponse.unauthorized('You must be logged in to update providers');
    }

    const params = await context.params;
    const idValidation = providerIdSchema.safeParse({ id: params.id });

    if (!idValidation.success) {
      return apiResponse.validationError(idValidation.error);
    }

    const body = await request.json();
    const bodyValidation = updateAIProviderSchema.safeParse(body);

    if (!bodyValidation.success) {
      return apiResponse.validationError(bodyValidation.error);
    }

    const provider = await service.updateProvider(idValidation.data.id, bodyValidation.data);

    logger.info('Updated AI provider via API', {
      providerId: provider.id,
      userId,
    });

    return apiResponse.success(provider);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to update AI provider', err);

    if (err.message.includes('not found')) {
      return apiResponse.notFound(err.message);
    }

    return apiResponse.error(err);
  }
}

/**
 * PATCH /api/ai-providers/:id/enable
 * Enable a provider
 */
export async function handleEnableProvider(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return apiResponse.unauthorized('You must be logged in');
    }

    const params = await context.params;
    const validation = providerIdSchema.safeParse({ id: params.id });

    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const provider = await service.setProviderEnabled(validation.data.id, true);

    logger.info('Enabled AI provider via API', {
      providerId: provider.id,
      userId,
    });

    return apiResponse.success(provider);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to enable AI provider', err);

    if (err.message.includes('not found')) {
      return apiResponse.notFound(err.message);
    }

    return apiResponse.error(err);
  }
}

/**
 * PATCH /api/ai-providers/:id/disable
 * Disable a provider
 */
export async function handleDisableProvider(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return apiResponse.unauthorized('You must be logged in');
    }

    const params = await context.params;
    const validation = providerIdSchema.safeParse({ id: params.id });

    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const provider = await service.setProviderEnabled(validation.data.id, false);

    logger.info('Disabled AI provider via API', {
      providerId: provider.id,
      userId,
    });

    return apiResponse.success(provider);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to disable AI provider', err);

    if (err.message.includes('not found')) {
      return apiResponse.notFound(err.message);
    }

    return apiResponse.error(err);
  }
}

// ============================================================================
// PROVIDER: DELETE HANDLERS
// ============================================================================

/**
 * DELETE /api/ai-providers/:id
 * Delete an AI provider
 */
export async function handleDeleteProvider(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return apiResponse.unauthorized('You must be logged in to delete providers');
    }

    const params = await context.params;
    const validation = providerIdSchema.safeParse({ id: params.id });

    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    await service.deleteProvider(validation.data.id);

    logger.info('Deleted AI provider via API', {
      providerId: validation.data.id,
      userId,
    });

    return apiResponse.success({ message: 'Provider deleted successfully' });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to delete AI provider', err);

    if (err.message.includes('not found')) {
      return apiResponse.notFound(err.message);
    }

    return apiResponse.error(err);
  }
}

// ============================================================================
// PROVIDER: CONNECTION TEST
// ============================================================================

/**
 * POST /api/ai-providers/:id/test-connection
 * Test provider connection
 */
export async function handleTestConnection(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const validation = providerIdSchema.safeParse({ id: params.id });

    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const result = await service.testConnection(validation.data.id);

    return apiResponse.success(result);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to test connection', err);

    if (err.message.includes('not found')) {
      return apiResponse.notFound(err.message);
    }

    return apiResponse.error(err);
  }
}

// ============================================================================
// PROVIDER: MODEL DISCOVERY
// ============================================================================

/**
 * POST /api/ai-providers/:id/discover-models
 * Discover models from provider (Ollama only)
 */
export async function handleDiscoverModels(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return apiResponse.unauthorized('You must be logged in');
    }

    const params = await context.params;
    const validation = providerIdSchema.safeParse({ id: params.id });

    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const result = await service.discoverOllamaModels(validation.data.id);

    logger.info('Discovered models via API', {
      providerId: validation.data.id,
      userId,
      modelsFound: result.modelsFound,
    });

    return apiResponse.success(result);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to discover models', err);

    if (err.message.includes('not found')) {
      return apiResponse.notFound(err.message);
    }

    if (err.message.includes('only supported for Ollama')) {
      return apiResponse.badRequest(err.message);
    }

    return apiResponse.error(err);
  }
}

// ============================================================================
// MODEL: CREATE HANDLERS
// ============================================================================

/**
 * POST /api/ai-provider-models
 * Create a new AI model
 */
export async function handleCreateModel(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return apiResponse.unauthorized('You must be logged in to create models');
    }

    const body = await request.json();
    const validation = createAIModelSchema.safeParse(body);

    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const model = await service.createModel(validation.data);

    logger.info('Created AI model via API', {
      modelId: model.id,
      userId,
    });

    return apiResponse.success(model, 201);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to create AI model', err);

    if (err.message.includes('already exists')) {
      return apiResponse.badRequest(err.message);
    }

    if (err.message.includes('not found')) {
      return apiResponse.notFound(err.message);
    }

    return apiResponse.error(err);
  }
}

// ============================================================================
// MODEL: READ HANDLERS
// ============================================================================

/**
 * GET /api/ai-provider-models
 * List AI models with optional filters
 */
export async function handleListModels(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = {
      providerId: searchParams.get('providerId') || undefined,
      providerKey: searchParams.get('providerKey') || undefined,
      modelType: searchParams.get('modelType') || undefined,
      isAvailable: searchParams.get('isAvailable') === 'true' ? true :
                   searchParams.get('isAvailable') === 'false' ? false : undefined,
      includeProvider: searchParams.get('includeProvider') === 'true',
    };

    const validation = listModelsQuerySchema.safeParse(query);
    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const models = validation.data.includeProvider
      ? await service.listModelsWithProvider(validation.data)
      : await service.listModels(validation.data);

    return apiResponse.success(models);
  } catch (error) {
    logger.error('Failed to list AI models', error as Error);
    return apiResponse.error(error as Error);
  }
}

/**
 * GET /api/ai-provider-models/:id
 * Get a single AI model by ID
 */
export async function handleGetModel(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const validation = modelIdSchema.safeParse({ id: parseInt(params.id, 10) });

    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const includeProvider = request.nextUrl.searchParams.get('includeProvider') === 'true';

    const model = includeProvider
      ? await service.getModelByIdWithProvider(validation.data.id)
      : await service.getModelById(validation.data.id);

    if (!model) {
      return apiResponse.notFound(`Model with ID "${validation.data.id}" not found`);
    }

    return apiResponse.success(model);
  } catch (error) {
    logger.error('Failed to get AI model', error as Error);
    return apiResponse.error(error as Error);
  }
}

/**
 * GET /api/ai-provider-models/for-purpose
 * Get models suitable for a specific purpose
 */
export async function handleGetModelsForPurpose(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const purpose = searchParams.get('purpose');

    if (!purpose) {
      return apiResponse.badRequest('purpose query parameter is required');
    }

    const validation = getModelsForPurposeQuerySchema.safeParse({ purpose });
    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const models = await service.getModelsForPurpose(validation.data);

    return apiResponse.success(models);
  } catch (error) {
    logger.error('Failed to get models for purpose', error as Error);
    return apiResponse.error(error as Error);
  }
}

// ============================================================================
// MODEL: UPDATE HANDLERS
// ============================================================================

/**
 * PUT /api/ai-provider-models/:id
 * Update an AI model
 */
export async function handleUpdateModel(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return apiResponse.unauthorized('You must be logged in to update models');
    }

    const params = await context.params;
    const idValidation = modelIdSchema.safeParse({ id: parseInt(params.id, 10) });

    if (!idValidation.success) {
      return apiResponse.validationError(idValidation.error);
    }

    const body = await request.json();
    const bodyValidation = updateAIModelSchema.safeParse(body);

    if (!bodyValidation.success) {
      return apiResponse.validationError(bodyValidation.error);
    }

    const model = await service.updateModel(idValidation.data.id, bodyValidation.data);

    logger.info('Updated AI model via API', {
      modelId: model.id,
      userId,
    });

    return apiResponse.success(model);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to update AI model', err);

    if (err.message.includes('not found')) {
      return apiResponse.notFound(err.message);
    }

    return apiResponse.error(err);
  }
}

// ============================================================================
// MODEL: DELETE HANDLERS
// ============================================================================

/**
 * DELETE /api/ai-provider-models/:id
 * Delete an AI model
 */
export async function handleDeleteModel(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return apiResponse.unauthorized('You must be logged in to delete models');
    }

    const params = await context.params;
    const validation = modelIdSchema.safeParse({ id: parseInt(params.id, 10) });

    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    await service.deleteModel(validation.data.id);

    logger.info('Deleted AI model via API', {
      modelId: validation.data.id,
      userId,
    });

    return apiResponse.success({ message: 'Model deleted successfully' });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to delete AI model', err);

    if (err.message.includes('not found')) {
      return apiResponse.notFound(err.message);
    }

    return apiResponse.error(err);
  }
}

// ============================================================================
// SYSTEM DEFAULTS HANDLERS
// ============================================================================

/**
 * GET /api/system-defaults/ai
 * Get system defaults for AI providers
 */
export async function handleGetSystemDefaults() {
  try {
    const defaults = await service.getSystemDefaults();
    return apiResponse.success(defaults);
  } catch (error) {
    logger.error('Failed to get system defaults', error as Error);
    return apiResponse.error(error as Error);
  }
}

/**
 * GET /api/system-defaults/ai/resolved
 * Get simplified resolved defaults
 */
export async function handleGetResolvedDefaults() {
  try {
    const defaults = await service.getResolvedDefaults();
    return apiResponse.success(defaults);
  } catch (error) {
    logger.error('Failed to get resolved defaults', error as Error);
    return apiResponse.error(error as Error);
  }
}

/**
 * PUT /api/system-defaults/ai
 * Update system defaults
 */
export async function handleUpdateSystemDefaults(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return apiResponse.unauthorized('You must be logged in to update system defaults');
    }

    const body = await request.json();
    const validation = updateSystemDefaultsSchema.safeParse(body);

    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const defaults = await service.updateSystemDefaults(validation.data);

    logger.info('Updated system defaults via API', { userId });

    return apiResponse.success(defaults);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to update system defaults', err);

    if (err.message.includes('not found')) {
      return apiResponse.notFound(err.message);
    }

    return apiResponse.error(err);
  }
}

/**
 * PUT /api/system-defaults/ai/:purpose
 * Set default for a specific purpose
 */
export async function handleSetDefaultForPurpose(
  request: NextRequest,
  context: { params: Promise<{ purpose: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return apiResponse.unauthorized('You must be logged in');
    }

    const params = await context.params;
    const purpose = params.purpose as 'text' | 'embedding' | 'chat';

    if (!['text', 'embedding', 'chat'].includes(purpose)) {
      return apiResponse.badRequest('Invalid purpose. Must be: text, embedding, or chat');
    }

    const body = await request.json();
    const validation = setDefaultBodySchema.safeParse(body);

    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const defaults = await service.setDefaultForPurpose(
      purpose,
      validation.data.providerId,
      validation.data.modelId
    );

    logger.info('Set default for purpose via API', {
      purpose,
      providerId: validation.data.providerId,
      modelId: validation.data.modelId,
      userId,
    });

    return apiResponse.success(defaults);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to set default for purpose', err);

    if (err.message.includes('not found')) {
      return apiResponse.notFound(err.message);
    }

    return apiResponse.error(err);
  }
}

// ============================================================================
// CACHE HANDLERS
// ============================================================================

/**
 * POST /api/ai-providers/cache/clear
 * Clear all AI providers cache
 */
export async function handleClearCache() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return apiResponse.unauthorized('You must be logged in');
    }

    await service.clearAllCache();

    logger.info('Cleared AI providers cache via API', { userId });

    return apiResponse.success({ message: 'Cache cleared successfully' });
  } catch (error) {
    logger.error('Failed to clear cache', error as Error);
    return apiResponse.error(error as Error);
  }
}

/**
 * GET /api/ai-providers/cache/stats
 * Get cache statistics
 */
export async function handleGetCacheStats() {
  try {
    const stats = service.getCacheStats();
    return apiResponse.success(stats);
  } catch (error) {
    logger.error('Failed to get cache stats', error as Error);
    return apiResponse.error(error as Error);
  }
}