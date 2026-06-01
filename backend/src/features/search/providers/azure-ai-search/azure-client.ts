// src/features/search/providers/azure-ai-search/azure-client.ts

/**
 * Azure AI Search Client
 *
 * Thin wrapper around the @azure/search-documents SDK.
 * Provides lazy-initialized singleton clients for index and search operations.
 *
 * Prerequisites:
 *   npm install @azure/search-documents
 *
 * Environment variables:
 *   AZURE_SEARCH_ENDPOINT  - e.g., https://<service>.search.windows.net
 *   AZURE_SEARCH_API_KEY   - Admin API key for index management
 *   AZURE_SEARCH_API_VERSION - API version (default: 2024-07-01)
 */

import 'server-only';

import { createLogger } from '@/shared/logger/logger';
import { DEFAULT_API_VERSION } from './azure-constants';

const logger = createLogger('azure-search-client');

// Lazy-loaded SDK types — allows the rest of the codebase to compile
// even if @azure/search-documents is not installed.
let _SearchIndexClient: any = null;
let _SearchClient: any = null;
let _AzureKeyCredential: any = null;

function loadSDK() {
    if (_SearchIndexClient) return;
    try {
        const sdk = require('@azure/search-documents');
        _SearchIndexClient = sdk.SearchIndexClient;
        _SearchClient = sdk.SearchClient;
        _AzureKeyCredential = sdk.AzureKeyCredential;
    } catch {
        throw new Error(
            'Azure AI Search SDK not installed. Run: npm install @azure/search-documents'
        );
    }
}

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
        loadSDK();
        const config = getConfig();
        indexClient = new _SearchIndexClient(
            config.endpoint,
            new _AzureKeyCredential(config.apiKey),
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
        loadSDK();
        const config = getConfig();
        const client = new _SearchClient(
            config.endpoint,
            indexName,
            new _AzureKeyCredential(config.apiKey),
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
