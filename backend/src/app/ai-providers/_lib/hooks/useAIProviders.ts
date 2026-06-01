// app/ai-providers/_lib/hooks/useAIProviders.ts

/**
 * AI Providers Hooks
 * 
 * React Query hooks for managing AI providers with:
 * - Automatic caching
 * - Optimistic updates
 * - Error handling with toast notifications
 * - Loading states
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { aiProvidersApi, aiModelsApi, systemDefaultsApi, ApiError } from '../api-client';
import type {
    AIProviderWithModelsResponse,
    AIModelWithProviderResponse,
    UpdateAIProviderInput,
    CreateAIProviderInput,
    UpdateSystemDefaultsInput,
} from '@/features/ai-providers';

// ============================================================================
// Query Keys
// ============================================================================

export const aiProviderKeys = {
    all: ['ai-providers'] as const,
    lists: () => [...aiProviderKeys.all, 'list'] as const,
    list: (params?: Record<string, unknown>) => [...aiProviderKeys.lists(), params] as const,
    enabled: () => [...aiProviderKeys.all, 'enabled'] as const,
    details: () => [...aiProviderKeys.all, 'detail'] as const,
    detail: (id: string) => [...aiProviderKeys.details(), id] as const,
};

export const aiModelKeys = {
    all: ['ai-models'] as const,
    lists: () => [...aiModelKeys.all, 'list'] as const,
    list: (params?: Record<string, unknown>) => [...aiModelKeys.lists(), params] as const,
    forPurpose: (purpose: string) => [...aiModelKeys.all, 'for-purpose', purpose] as const,
    details: () => [...aiModelKeys.all, 'detail'] as const,
    detail: (id: number) => [...aiModelKeys.details(), id] as const,
};

export const systemDefaultsKeys = {
    all: ['system-defaults'] as const,
    ai: () => [...systemDefaultsKeys.all, 'ai'] as const,
    resolved: () => [...systemDefaultsKeys.ai(), 'resolved'] as const,
};

// ============================================================================
// Provider Hooks
// ============================================================================

/**
 * Hook to fetch all providers with models
 */
export function useAIProviders(options?: { enabled?: boolean }) {
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: aiProviderKeys.list({ includeModels: true }),
        queryFn: () => aiProvidersApi.list({ includeModels: true }) as Promise<AIProviderWithModelsResponse[]>,
        enabled: options?.enabled !== false,
        staleTime: 30000, // 30 seconds
    });

    // Enable mutation
    const enableMutation = useMutation({
        mutationFn: (id: string) => aiProvidersApi.enable(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: aiProviderKeys.all });
            queryClient.invalidateQueries({ queryKey: systemDefaultsKeys.all });
            toast.success('Provider enabled');
        },
        onError: (error: ApiError) => {
            toast.error(error.message || 'Failed to enable provider');
        },
    });

    // Disable mutation
    const disableMutation = useMutation({
        mutationFn: (id: string) => aiProvidersApi.disable(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: aiProviderKeys.all });
            queryClient.invalidateQueries({ queryKey: systemDefaultsKeys.all });
            toast.success('Provider disabled');
        },
        onError: (error: ApiError) => {
            toast.error(error.message || 'Failed to disable provider');
        },
    });

    // Delete mutation
    const deleteMutation = useMutation({
        mutationFn: (id: string) => aiProvidersApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: aiProviderKeys.all });
            queryClient.invalidateQueries({ queryKey: systemDefaultsKeys.all });
            toast.success('Provider deleted');
        },
        onError: (error: ApiError) => {
            toast.error(error.message || 'Failed to delete provider');
        },
    });

    return {
        providers: query.data || [],
        isLoading: query.isLoading,
        isError: query.isError,
        error: query.error,
        refetch: query.refetch,

        enableProvider: enableMutation.mutateAsync,
        disableProvider: disableMutation.mutateAsync,
        deleteProvider: deleteMutation.mutateAsync,

        isEnabling: enableMutation.isPending,
        isDisabling: disableMutation.isPending,
        isDeleting: deleteMutation.isPending,
    };
}

/**
 * Hook to fetch single provider with models
 */
export function useAIProvider(id: string, options?: { enabled?: boolean }) {
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: aiProviderKeys.detail(id),
        queryFn: () => aiProvidersApi.getById(id, true) as Promise<AIProviderWithModelsResponse>,
        enabled: options?.enabled !== false && !!id,
    });

    // Update mutation
    const updateMutation = useMutation({
        mutationFn: (data: UpdateAIProviderInput) => aiProvidersApi.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: aiProviderKeys.detail(id) });
            queryClient.invalidateQueries({ queryKey: aiProviderKeys.lists() });
            toast.success('Provider updated');
        },
        onError: (error: ApiError) => {
            toast.error(error.message || 'Failed to update provider');
        },
    });

    // Test connection mutation
    const testConnectionMutation = useMutation({
        mutationFn: () => aiProvidersApi.testConnection(id),
        onSuccess: (result) => {
            if (result.success) {
                toast.success(`Connected successfully (${result.responseTimeMs}ms)`);
            } else {
                toast.error(`Connection failed: ${result.message}`);
            }
            queryClient.invalidateQueries({ queryKey: aiProviderKeys.detail(id) });
        },
        onError: (error: ApiError) => {
            toast.error(error.message || 'Connection test failed');
        },
    });

    // Discover models mutation (Ollama only)
    const discoverModelsMutation = useMutation({
        mutationFn: () => aiProvidersApi.discoverModels(id),
        onSuccess: (result) => {
            if (result.success) {
                toast.success(`Discovered ${result.modelsFound} models (${result.modelsAdded} new)`);
            } else {
                toast.warning(`Discovery completed with ${result.errors.length} errors`);
            }
            queryClient.invalidateQueries({ queryKey: aiProviderKeys.detail(id) });
            queryClient.invalidateQueries({ queryKey: aiProviderKeys.lists() });
            queryClient.invalidateQueries({ queryKey: aiModelKeys.all });
        },
        onError: (error: ApiError) => {
            toast.error(error.message || 'Model discovery failed');
        },
    });

    return {
        provider: query.data,
        isLoading: query.isLoading,
        isError: query.isError,
        error: query.error,
        refetch: query.refetch,

        updateProvider: updateMutation.mutateAsync,
        testConnection: testConnectionMutation.mutateAsync,
        discoverModels: discoverModelsMutation.mutateAsync,

        isUpdating: updateMutation.isPending,
        isTesting: testConnectionMutation.isPending,
        isDiscovering: discoverModelsMutation.isPending,

        testResult: testConnectionMutation.data,
        discoveryResult: discoverModelsMutation.data,
    };
}

/**
 * Hook to create a new provider
 */
export function useCreateProvider() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: CreateAIProviderInput) => aiProvidersApi.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: aiProviderKeys.all });
            toast.success('Provider created successfully');
        },
        onError: (error: ApiError) => {
            toast.error(error.message || 'Failed to create provider');
        },
    });
}

// ============================================================================
// Model Hooks
// ============================================================================

/**
 * Hook to fetch models for a specific purpose
 */
export function useModelsForPurpose(purpose: 'text_generation' | 'embedding' | 'chat') {
    return useQuery({
        queryKey: aiModelKeys.forPurpose(purpose),
        queryFn: () => aiModelsApi.getForPurpose(purpose),
        staleTime: 60000, // 1 minute
    });
}

/**
 * Hook to fetch all models with provider info
 */
export function useAIModels(params?: {
    providerId?: string;
    modelType?: 'text' | 'embedding' | 'chat' | 'vision';
    isAvailable?: boolean;
}) {
    return useQuery({
        queryKey: aiModelKeys.list({ ...params, includeProvider: true }),
        queryFn: () => aiModelsApi.list({ ...params, includeProvider: true }) as Promise<AIModelWithProviderResponse[]>,
        staleTime: 30000,
    });
}

// ============================================================================
// System Defaults Hooks
// ============================================================================

/**
 * Hook to fetch and manage system defaults
 */
export function useSystemDefaults() {
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: systemDefaultsKeys.ai(),
        queryFn: () => systemDefaultsApi.get(),
        staleTime: 60000,
    });

    const resolvedQuery = useQuery({
        queryKey: systemDefaultsKeys.resolved(),
        queryFn: () => systemDefaultsApi.getResolved(),
        staleTime: 60000,
    });

    // Update mutation
    const updateMutation = useMutation({
        mutationFn: (data: UpdateSystemDefaultsInput) => systemDefaultsApi.update(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: systemDefaultsKeys.all });
            toast.success('System defaults updated');
        },
        onError: (error: ApiError) => {
            toast.error(error.message || 'Failed to update system defaults');
        },
    });

    // Set for purpose mutation
    const setForPurposeMutation = useMutation({
        mutationFn: ({ purpose, providerId, modelId }: {
            purpose: 'text' | 'embedding' | 'chat';
            providerId: string | null;
            modelId: number | null;
        }) => systemDefaultsApi.setForPurpose(purpose, providerId, modelId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: systemDefaultsKeys.all });
            toast.success('Default updated');
        },
        onError: (error: ApiError) => {
            toast.error(error.message || 'Failed to update default');
        },
    });

    return {
        defaults: query.data,
        resolved: resolvedQuery.data,
        isLoading: query.isLoading || resolvedQuery.isLoading,
        isError: query.isError || resolvedQuery.isError,
        error: query.error || resolvedQuery.error,
        refetch: () => {
            query.refetch();
            resolvedQuery.refetch();
        },

        updateDefaults: updateMutation.mutateAsync,
        setDefaultForPurpose: setForPurposeMutation.mutateAsync,

        isUpdating: updateMutation.isPending || setForPurposeMutation.isPending,
    };
}