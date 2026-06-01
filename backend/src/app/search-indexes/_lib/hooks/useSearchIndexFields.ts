// app/search-indexes/_lib/hooks/useSearchIndexFields.ts

/**
 * Search Index Fields Hooks
 * 
 * React Query hooks for managing search index fields.
 * 
 * UPDATED: Added hooks for new mapping config operations
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { searchIndexFieldsApi, ApiError } from '../api-client';
import { searchIndexKeys } from './useSearchIndexes';
import type {
    SearchIndexField,
    UpdateSearchIndexFieldDTO,
    BulkUpdateFieldMappingsDTO,
    FieldMappingConfig,
} from '@/features/search-index';

// ============================================================================
// Query Keys
// ============================================================================

export const fieldKeys = {
    all: (indexId: string) => [...searchIndexKeys.detail(indexId), 'fields'] as const,
    list: (indexId: string) => [...fieldKeys.all(indexId), 'list'] as const,
    summary: (indexId: string) => [...fieldKeys.all(indexId), 'summary'] as const,
    validation: (indexId: string) => [...fieldKeys.all(indexId), 'validation'] as const,
};

// ============================================================================
// List Fields Hook
// ============================================================================

/**
 * Hook to get all fields for a search index
 */
export function useSearchIndexFields(searchIndexId: string, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: fieldKeys.list(searchIndexId),
        queryFn: () => searchIndexFieldsApi.list(searchIndexId),
        enabled: options?.enabled !== false && !!searchIndexId,
    });
}

// ============================================================================
// Field Summary Hook
// ============================================================================

/**
 * Hook to get field mapping summary
 */
export function useFieldMappingSummary(searchIndexId: string, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: fieldKeys.summary(searchIndexId),
        queryFn: () => searchIndexFieldsApi.getSummary(searchIndexId),
        enabled: options?.enabled !== false && !!searchIndexId,
    });
}

// ============================================================================
// Validation Hook
// ============================================================================

/**
 * Hook to validate field mappings
 */
export function useValidateFieldMappings(searchIndexId: string, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: fieldKeys.validation(searchIndexId),
        queryFn: () => searchIndexFieldsApi.validate(searchIndexId),
        enabled: options?.enabled !== false && !!searchIndexId,
    });
}

// ============================================================================
// Update Field Hook
// ============================================================================

/**
 * Hook to update a single field
 */
export function useUpdateField(searchIndexId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ fieldId, data }: { fieldId: number; data: UpdateSearchIndexFieldDTO }) =>
            searchIndexFieldsApi.updateField(searchIndexId, fieldId, data),
        onSuccess: (updatedField) => {
            // Update the field in the list cache
            queryClient.setQueryData<SearchIndexField[]>(
                fieldKeys.list(searchIndexId),
                (oldFields) => {
                    if (!oldFields) return [updatedField];
                    return oldFields.map((f) =>
                        f.id === updatedField.id ? updatedField : f
                    );
                }
            );

            // Invalidate summary since mapping status may have changed
            queryClient.invalidateQueries({ queryKey: fieldKeys.summary(searchIndexId) });
            queryClient.invalidateQueries({ queryKey: fieldKeys.validation(searchIndexId) });

            // Invalidate the main search index detail
            queryClient.invalidateQueries({ queryKey: searchIndexKeys.detail(searchIndexId) });

            toast.success('Field updated successfully');
        },
        onError: (error: ApiError) => {
            toast.error(error.message || 'Failed to update field');
        },
    });
}

// ============================================================================
// Update Field Mapping Config Hook (NEW)
// ============================================================================

/**
 * Hook to update a field's mapping configuration
 * Used for setting mode, static value, generator, etc.
 */
export function useUpdateFieldMappingConfig(searchIndexId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ fieldId, config }: { fieldId: number; config: FieldMappingConfig }) =>
            searchIndexFieldsApi.updateFieldMappingConfig(searchIndexId, fieldId, config),
        onSuccess: (updatedField) => {
            // Update the field in the list cache
            queryClient.setQueryData<SearchIndexField[]>(
                fieldKeys.list(searchIndexId),
                (oldFields) => {
                    if (!oldFields) return [updatedField];
                    return oldFields.map((f) =>
                        f.id === updatedField.id ? updatedField : f
                    );
                }
            );

            // Invalidate summary since mapping status may have changed
            queryClient.invalidateQueries({ queryKey: fieldKeys.summary(searchIndexId) });
            queryClient.invalidateQueries({ queryKey: fieldKeys.validation(searchIndexId) });

            // Invalidate the main search index detail
            queryClient.invalidateQueries({ queryKey: searchIndexKeys.detail(searchIndexId) });

            toast.success('Field configuration updated');
        },
        onError: (error: ApiError) => {
            toast.error(error.message || 'Failed to update field configuration');
        },
    });
}

// ============================================================================
// Bulk Update Mappings Hook
// ============================================================================

/**
 * Hook to bulk update field mappings
 */
export function useBulkUpdateMappings(searchIndexId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: BulkUpdateFieldMappingsDTO) =>
            searchIndexFieldsApi.bulkUpdateMappings(searchIndexId, data),
        onSuccess: (updatedFields) => {
            // Replace the entire fields list
            queryClient.setQueryData<SearchIndexField[]>(
                fieldKeys.list(searchIndexId),
                (oldFields) => {
                    if (!oldFields) return updatedFields;
                    // Merge updated fields into existing list
                    const updatedMap = new Map(updatedFields.map(f => [f.id, f]));
                    return oldFields.map(f => updatedMap.get(f.id) || f);
                }
            );

            // Invalidate related queries
            queryClient.invalidateQueries({ queryKey: fieldKeys.summary(searchIndexId) });
            queryClient.invalidateQueries({ queryKey: fieldKeys.validation(searchIndexId) });
            queryClient.invalidateQueries({ queryKey: searchIndexKeys.detail(searchIndexId) });
        },
    });
}

// ============================================================================
// Clear Mappings Hook
// ============================================================================

/**
 * Hook to clear all field mappings
 */
export function useClearMappings(searchIndexId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => searchIndexFieldsApi.clearMappings(searchIndexId),
        onSuccess: () => {
            // Invalidate all field-related queries
            queryClient.invalidateQueries({ queryKey: fieldKeys.all(searchIndexId) });
            queryClient.invalidateQueries({ queryKey: searchIndexKeys.detail(searchIndexId) });

            toast.success('Field mappings cleared');
        },
        onError: (error: ApiError) => {
            toast.error(error.message || 'Failed to clear mappings');
        },
    });
}

// ============================================================================
// Update Additional Data Config Hook (NEW)
// ============================================================================

/**
 * Hook to update additionalData field's collect configuration
 */
export function useUpdateAdditionalDataConfig(searchIndexId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (collectFields: string[]) =>
            searchIndexFieldsApi.updateAdditionalDataConfig(searchIndexId, collectFields),
        onSuccess: (updatedField) => {
            // Update the field in the list cache
            queryClient.setQueryData<SearchIndexField[]>(
                fieldKeys.list(searchIndexId),
                (oldFields) => {
                    if (!oldFields) return [updatedField];
                    return oldFields.map((f) =>
                        f.id === updatedField.id ? updatedField : f
                    );
                }
            );

            // Invalidate summary
            queryClient.invalidateQueries({ queryKey: fieldKeys.summary(searchIndexId) });
            queryClient.invalidateQueries({ queryKey: fieldKeys.validation(searchIndexId) });

            toast.success('Additional data configuration updated');
        },
        onError: (error: ApiError) => {
            toast.error(error.message || 'Failed to update additional data configuration');
        },
    });
}

// ============================================================================
// Combined Hook for Field Management
// ============================================================================

/**
 * Combined hook for managing search index fields
 * Provides all field-related queries and mutations
 */
export function useSearchIndexFieldManagement(searchIndexId: string) {
    const queryClient = useQueryClient();

    // Queries
    const fieldsQuery = useSearchIndexFields(searchIndexId);
    const summaryQuery = useFieldMappingSummary(searchIndexId);
    const validationQuery = useValidateFieldMappings(searchIndexId, { enabled: false });

    // Mutations
    const updateFieldMutation = useUpdateField(searchIndexId);
    const updateMappingConfigMutation = useUpdateFieldMappingConfig(searchIndexId);
    const bulkUpdateMutation = useBulkUpdateMappings(searchIndexId);
    const clearMappingsMutation = useClearMappings(searchIndexId);
    const updateAdditionalDataMutation = useUpdateAdditionalDataConfig(searchIndexId);

    return {
        // Data
        fields: fieldsQuery.data ?? [],
        summary: summaryQuery.data,
        validation: validationQuery.data,

        // Loading states
        isLoading: fieldsQuery.isLoading,
        isSummaryLoading: summaryQuery.isLoading,
        isValidating: validationQuery.isFetching,

        // Error states
        isError: fieldsQuery.isError,
        error: fieldsQuery.error,

        // Actions
        updateField: updateFieldMutation.mutateAsync,
        updateMappingConfig: updateMappingConfigMutation.mutateAsync,
        bulkUpdateMappings: bulkUpdateMutation.mutateAsync,
        clearMappings: clearMappingsMutation.mutateAsync,
        updateAdditionalDataConfig: updateAdditionalDataMutation.mutateAsync,
        validateMappings: () => validationQuery.refetch(),

        // Action states
        isUpdatingField: updateFieldMutation.isPending,
        isUpdatingMappingConfig: updateMappingConfigMutation.isPending,
        isBulkUpdating: bulkUpdateMutation.isPending,
        isClearing: clearMappingsMutation.isPending,
        isUpdatingAdditionalData: updateAdditionalDataMutation.isPending,

        // Refetch
        refetch: fieldsQuery.refetch,
        refetchSummary: summaryQuery.refetch,
    };
}