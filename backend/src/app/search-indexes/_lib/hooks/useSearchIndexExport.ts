// app/search-indexes/_lib/hooks/useSearchIndexExport.ts

/**
 * Search Index Export/Import Hooks
 *
 * React Query hooks for exporting and importing search indexes.
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
    searchIndexesApi,
    type SearchIndexImportPayload,
    type SearchIndexImportPreview,
    type SearchIndexImportResult,
} from '../api-client';
import { searchIndexKeys } from './useSearchIndexes';

// ============================================================================
// EXPORT HOOKS
// ============================================================================

/**
 * Hook to export search index as JSON
 */
export function useExportSearchIndex() {
    return useMutation({
        mutationFn: async ({ id, name }: { id: string; name: string }) => {
            const blob = await searchIndexesApi.export(id);

            // Trigger download
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `search-index-${name}-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            return { name };
        },

        onSuccess: ({ name }) => {
            toast.success(`Search index "${name}" exported successfully`);
        },

        meta: { label: 'Export search index' },
    });
}

// ============================================================================
// IMPORT HOOKS
// ============================================================================

/**
 * Hook to preview search index import
 */
export function usePreviewImport() {
    return useMutation<SearchIndexImportPreview, Error, unknown>({
        mutationFn: (importData: unknown) =>
            searchIndexesApi.previewImport(importData),

        meta: { label: 'Preview import' },
    });
}

/**
 * Hook to import search index from JSON
 */
export function useImportSearchIndex() {
    const queryClient = useQueryClient();

    return useMutation<SearchIndexImportResult, Error, SearchIndexImportPayload>({
        mutationFn: (payload: SearchIndexImportPayload) =>
            searchIndexesApi.import(payload),

        onSuccess: (result) => {
            // Invalidate search indexes list
            queryClient.invalidateQueries({
                queryKey: searchIndexKeys.all,
            });

            toast.success(result.message);

            // Show warnings if any
            if (result.warnings && result.warnings.length > 0) {
                result.warnings.forEach(warning => {
                    toast.warning(warning);
                });
            }
        },

        meta: { label: 'Import search index' },
    });
}
