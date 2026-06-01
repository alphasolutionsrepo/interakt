// app/settings/search/_lib/api-client.ts

/**
 * Global Search Settings API Client
 */

import type { GlobalSettingsResponse, UpdateGlobalSettingsInput } from '@/features/global-settings';

const API_BASE = '/api/settings/search';

/**
 * Fetch wrapper with error handling
 */
async function fetchApi<T>(
    url: string,
    options?: RequestInit
): Promise<T> {
    const response = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
        },
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || data.message || 'Request failed');
    }

    return data.data;
}

/**
 * Global Search Settings API
 */
export const globalSearchSettingsApi = {
    /**
     * Get current global search settings
     */
    async get(): Promise<GlobalSettingsResponse> {
        return fetchApi<GlobalSettingsResponse>(API_BASE);
    },

    /**
     * Update global search settings
     */
    async update(data: UpdateGlobalSettingsInput): Promise<GlobalSettingsResponse> {
        return fetchApi<GlobalSettingsResponse>(API_BASE, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },
};
