// app/settings/search/_lib/hooks/useGlobalSearchSettings.ts

/**
 * React Query hooks for global search settings
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { globalSearchSettingsApi } from '../api-client';
import type { UpdateGlobalSettingsInput } from '@/features/global-settings';

const QUERY_KEY = ['global-search-settings'];

/**
 * Hook to fetch global search settings
 */
export function useGlobalSearchSettings() {
    const query = useQuery({
        queryKey: QUERY_KEY,
        queryFn: () => globalSearchSettingsApi.get(),
        staleTime: 60000, // 1 minute
    });

    return {
        settings: query.data,
        isLoading: query.isLoading,
        isError: query.isError,
        error: query.error,
        refetch: query.refetch,
    };
}

/**
 * Hook to update global search settings
 */
export function useUpdateGlobalSearchSettings() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: UpdateGlobalSettingsInput) =>
            globalSearchSettingsApi.update(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEY });
            toast.success('Search settings updated successfully');
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Failed to update settings');
        },
    });
}
