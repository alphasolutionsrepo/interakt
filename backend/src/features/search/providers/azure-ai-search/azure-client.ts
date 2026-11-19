// src/features/search/providers/azure-ai-search/azure-client.ts

/**
 * Azure AI Search Client
 *
 * Thin wrapper around the @azure/search-documents SDK.
 * Provides lazy-initialized singleton clients for index and search operations.
 *
 * Environment variables:
 *   AZURE_SEARCH_ENDPOINT  - e.g., https://<service>.search.windows.net
 *   AZURE_SEARCH_API_KEY   - Admin API key for index management
 *   AZURE_SEARCH_API_VERSION - API version (default: 2024-07-01)
 */

import 'server-only';

// Imported statically, like the provider classes in init.ts: the SDK ships ES modules, and a
// require() of such a package can return a promise instead of the module. Loading it at startup
// also puts it under the CI start check.
import { AzureKeyCredential, SearchClient, SearchIndexClient } from '@azure/search-documents';

import { createLogger } from '@/shared/logger/logger';
import { DEFAULT_API_VERSION } from './azure-constants';

const logger = createLogger('azure-search-client');

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface AzureSearchConfig {
    endpoint: string;
    apiKey: string;
    apiVersion: string;
}

function getConfig(): AzureSearchConfig {
    const endpoint = process.env.AZURE_SEARCH_ENDPOINT;
    const apiKey = process.env.AZURE_SEARCH_API_KEY;
    const apiVersion = process.env.AZURE_SEARCH_API_VERSION ?? DEFAULT_API_VERSION;

    if (!endpoint || !apiKey) {
        throw new Error(
            'Azure AI Search not configured. Set AZURE_SEARCH_ENDPOINT and AZURE_SEARCH_API_KEY environment variables.'
        );
    }

    return { endpoint, apiKey, apiVersion };
}

// ============================================================================
// CLIENT SINGLETONS
// ============================================================================

let indexClient: any = null;
const searchClients = new Map<string, any>();

/**
 * Get the SearchIndexClient for managing indexes (create, delete, list).
 */
export function getIndexClient(): any {
    if (!indexClient) {
        const config = getConfig();
        indexClient = new SearchIndexClient(
            config.endpoint,
            new AzureKeyCredential(config.apiKey),
            { apiVersion: config.apiVersion }
        );
        logger.info('Azure SearchIndexClient initialized', { endpoint: config.endpoint });
    }
    return indexClient;
}

/**
 * Get a SearchClient for a specific index (search, upload, delete documents).
 */
export function getSearchClient(indexName: string): any {
    if (!searchClients.has(indexName)) {
        const config = getConfig();
        const client = new SearchClient(
            config.endpoint,
            indexName,
            new AzureKeyCredential(config.apiKey),
            { apiVersion: config.apiVersion }
        );
        searchClients.set(indexName, client);
    }
    return searchClients.get(indexName);
}

/**
 * Close all clients (cleanup).
 */
export function closeClients(): void {
    indexClient = null;
    searchClients.clear();
    logger.info('Azure clients closed');
}

/**
 * Check if Azure AI Search service is reachable.
 */
export async function checkAzureHealth(): Promise<{ healthy: boolean; error?: string }> {
    try {
        const client = getIndexClient();
        // List indexes is a lightweight operation to verify connectivity
        const result = client.listIndexes();
        // Consume at least one item to verify the connection works
        for await (const _ of result) {
            break;
        }
        return { healthy: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Azure health check failed';
        logger.error('Azure health check failed', { error: message });
        return { healthy: false, error: message };
    }
}
