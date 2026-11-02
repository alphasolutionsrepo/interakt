// app/ai-providers/_lib/api-client.ts

import { ApiError, handleApiResponse } from '@/shared/api/api-error';

/**
 * AI Providers API Client
 * 
 * Thin wrapper around fetch() with:
 * - Type safety from src/features/ai-providers
 * - Consistent error handling
 * - No business logic (just HTTP calls)
 */

import type {
    AIProviderResponse,
    AIProviderWithModelsResponse,
    AIProviderModelResponse,
    AIModelWithProviderResponse,
    SystemDefaultsResponse,
    ResolvedSystemDefaults,
    ConnectionTestResult,
    OllamaDiscoveryResult,
    CreateAIProviderInput,
    UpdateAIProviderInput,
    CreateAIModelInput,
    UpdateAIModelInput,
    UpdateSystemDefaultsInput,
} from '@/features/ai-providers';

// ============================================================================
// Error Handling
// ============================================================================

export { ApiError };


// ============================================================================
// AI Providers API
// ============================================================================

export const aiProvidersApi = {
    /**
     * List all providers
     */
    list: async (params?: {
        isEnabled?: boolean;
        providerType?: 'cloud' | 'local';
        includeModels?: boolean;
    }): Promise<AIProviderResponse[] | AIProviderWithModelsResponse[]> => {
        const searchParams = new URLSearchParams();
        if (params?.isEnabled !== undefined) searchParams.set('isEnabled', String(params.isEnabled));
        if (params?.providerType) searchParams.set('providerType', params.providerType);
        if (params?.includeModels) searchParams.set('includeModels', 'true');

        const response = await fetch(`/api/ai-providers?${searchParams}`);
        return handleApiResponse(response);
    },

    /**
     * Get enabled providers with models
     */
    getEnabled: async (): Promise<AIProviderWithModelsResponse[]> => {
        const response = await fetch('/api/ai-providers/enabled');
        return handleApiResponse(response);
    },

    /**
     * Get single provider by ID
     */
    getById: async (id: string, includeModels = false): Promise<AIProviderResponse | AIProviderWithModelsResponse> => {
        const params = includeModels ? '?includeModels=true' : '';
        const response = await fetch(`/api/ai-providers/${id}${params}`);
        return handleApiResponse(response);
    },

    /**
     * Get provider by key
     */
    getByKey: async (key: string, includeModels = false): Promise<AIProviderResponse | AIProviderWithModelsResponse> => {
        const params = includeModels ? '?includeModels=true' : '';
        const response = await fetch(`/api/ai-providers/key/${key}${params}`);
        return handleApiResponse(response);
    },

    /**
     * Create new provider
     */
    create: async (data: CreateAIProviderInput): Promise<AIProviderResponse> => {
        const response = await fetch('/api/ai-providers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return handleApiResponse(response);
    },

    /**
     * Update provider
     */
    update: async (id: string, data: UpdateAIProviderInput): Promise<AIProviderResponse> => {
        const response = await fetch(`/api/ai-providers/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return handleApiResponse(response);
    },

    /**
     * Enable provider
     */
    enable: async (id: string): Promise<AIProviderResponse> => {
        const response = await fetch(`/api/ai-providers/${id}/enable`, {
            method: 'PATCH',
        });
        return handleApiResponse(response);
    },

    /**
     * Disable provider
     */
    disable: async (id: string): Promise<AIProviderResponse> => {
        const response = await fetch(`/api/ai-providers/${id}/disable`, {
            method: 'PATCH',
        });
        return handleApiResponse(response);
    },

    /**
     * Delete provider
     */
    delete: async (id: string): Promise<void> => {
        const response = await fetch(`/api/ai-providers/${id}`, {
            method: 'DELETE',
        });
        await handleApiResponse(response);
    },

    /**
     * Test provider connection
     */
    testConnection: async (id: string): Promise<ConnectionTestResult> => {
        const response = await fetch(`/api/ai-providers/${id}/test-connection`, {
            method: 'POST',
        });
        return handleApiResponse(response);
    },

    /**
     * Discover models (Ollama only)
     */
    discoverModels: async (id: string): Promise<OllamaDiscoveryResult> => {
        const response = await fetch(`/api/ai-providers/${id}/discover-models`, {
            method: 'POST',
        });
        return handleApiResponse(response);
    },

    /**
     * Clear cache
     */
    clearCache: async (): Promise<void> => {
        const response = await fetch('/api/ai-providers/cache', {
            method: 'POST',
        });
        await handleApiResponse(response);
    },

    /**
     * Get cache stats
     */
    getCacheStats: async (): Promise<{ hits: number; misses: number; size: number }> => {
        const response = await fetch('/api/ai-providers/cache');
        return handleApiResponse(response);
    },
};

// ============================================================================
// AI Provider Models API
// ============================================================================

export const aiModelsApi = {
    /**
     * List models with filters
     */
    list: async (params?: {
        providerId?: string;
        providerKey?: string;
        modelType?: 'text' | 'embedding' | 'chat' | 'vision';
        isAvailable?: boolean;
        includeProvider?: boolean;
    }): Promise<AIProviderModelResponse[] | AIModelWithProviderResponse[]> => {
        const searchParams = new URLSearchParams();
        if (params?.providerId) searchParams.set('providerId', params.providerId);
        if (params?.providerKey) searchParams.set('providerKey', params.providerKey);
        if (params?.modelType) searchParams.set('modelType', params.modelType);
        if (params?.isAvailable !== undefined) searchParams.set('isAvailable', String(params.isAvailable));
        if (params?.includeProvider) searchParams.set('includeProvider', 'true');

        const response = await fetch(`/api/ai-provider-models?${searchParams}`);
        return handleApiResponse(response);
    },

    /**
     * Get models for a specific purpose
     */
    getForPurpose: async (purpose: 'text_generation' | 'embedding' | 'chat'): Promise<AIModelWithProviderResponse[]> => {
        const response = await fetch(`/api/ai-provider-models/for-purpose?purpose=${purpose}`);
        return handleApiResponse(response);
    },

    /**
     * Get single model by ID
     */
    getById: async (id: number, includeProvider = false): Promise<AIProviderModelResponse | AIModelWithProviderResponse> => {
        const params = includeProvider ? '?includeProvider=true' : '';
        const response = await fetch(`/api/ai-provider-models/${id}${params}`);
        return handleApiResponse(response);
    },

    /**
     * Create new model
     */
    create: async (data: CreateAIModelInput): Promise<AIProviderModelResponse> => {
        const response = await fetch('/api/ai-provider-models', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return handleApiResponse(response);
    },

    /**
     * Update model
     */
    update: async (id: number, data: UpdateAIModelInput): Promise<AIProviderModelResponse> => {
        const response = await fetch(`/api/ai-provider-models/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return handleApiResponse(response);
    },

    /**
     * Delete model
     */
    delete: async (id: number): Promise<void> => {
        const response = await fetch(`/api/ai-provider-models/${id}`, {
            method: 'DELETE',
        });
        await handleApiResponse(response);
    },
};

// ============================================================================
// System Defaults API
// ============================================================================

export const systemDefaultsApi = {
    /**
     * Get system defaults with resolved details
     */
    get: async (): Promise<SystemDefaultsResponse> => {
        const response = await fetch('/api/system-defaults/ai');
        return handleApiResponse(response);
    },

    /**
     * Get simplified resolved defaults
     */
    getResolved: async (): Promise<ResolvedSystemDefaults> => {
        const response = await fetch('/api/system-defaults/ai/resolved');
        return handleApiResponse(response);
    },

    /**
     * Update system defaults
     */
    update: async (data: UpdateSystemDefaultsInput): Promise<SystemDefaultsResponse> => {
        const response = await fetch('/api/system-defaults/ai', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return handleApiResponse(response);
    },

    /**
     * Set default for specific purpose
     */
    setForPurpose: async (
        purpose: 'text' | 'embedding' | 'chat',
        providerId: string | null,
        modelId: number | null
    ): Promise<SystemDefaultsResponse> => {
        const response = await fetch(`/api/system-defaults/ai/${purpose}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ providerId, modelId }),
        });
        return handleApiResponse(response);
    },
};