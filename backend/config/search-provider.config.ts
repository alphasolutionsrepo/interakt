// config/search-provider.config.ts

/**
 * Search Provider Configuration
 *
 * Defines which search engine providers are enabled and their settings.
 *
 * To add a new provider:
 * 1. Add an entry to the `providers` array below
 * 2. Set the required environment variables
 * 3. Implement the SearchEngineProvider interface
 * 4. The provider auto-registers via registerProviderClass() on import
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Configuration for a single search provider.
 */
export interface SearchProviderDefinition {
    /** Provider type identifier (must match the provider's `type` property) */
    type: string;

    /** Whether this provider is enabled and available for use */
    enabled: boolean;

    /** Whether this is the default provider for new indexes */
    isDefault: boolean;

    /** Provider-specific connection configuration */
    config?: Record<string, unknown>;
}

/**
 * Top-level search providers configuration.
 */
export interface SearchProvidersConfig {
    /** List of configured providers */
    providers: SearchProviderDefinition[];
}

// ============================================================================
// PROVIDER SELECTION
// ============================================================================

/**
 * Supported search backends.
 */
export type SearchProviderType = 'elasticsearch' | 'azure-ai-search';

/**
 * The default search backend for this deployment, selected via the
 * `SEARCH_PROVIDER` environment variable.
 *
 * Defaults to `elasticsearch` so that an unconfigured environment (e.g. local
 * docker-compose dev) behaves exactly as before — no env var required.
 *
 * Set `SEARCH_PROVIDER=azure-ai-search` for an Azure-only deployment: this
 * disables Elasticsearch entirely (it is never initialized and `ELASTICSEARCH_URL`
 * is not needed), and makes Azure AI Search the default provider.
 */
export const selectedSearchProvider: SearchProviderType =
    (process.env.SEARCH_PROVIDER ?? 'elasticsearch').trim().toLowerCase() === 'azure-ai-search'
        ? 'azure-ai-search'
        : 'elasticsearch';

const azureSelected = selectedSearchProvider === 'azure-ai-search';

// Back-compat: Azure AI Search may also be configured as a (non-default)
// secondary provider whenever AZURE_SEARCH_ENDPOINT is present — preserving the
// previous behavior for environments that ran ES-default + Azure-secondary.
const azureConfigured = !!process.env.AZURE_SEARCH_ENDPOINT;

// ============================================================================
// CONFIGURATION
// ============================================================================

export const searchProvidersConfig: SearchProvidersConfig = {
    providers: [
        // ============================================================
        // ELASTICSEARCH
        // ============================================================
        // Enabled and default unless Azure AI Search is explicitly selected
        // as the sole backend (SEARCH_PROVIDER=azure-ai-search).
        {
            type: 'elasticsearch',
            enabled: !azureSelected,
            isDefault: !azureSelected,
            // ES connection settings are managed via config/elasticsearch.config.ts
        },

        // ============================================================
        // AZURE AI SEARCH
        // ============================================================
        // Enabled when selected via SEARCH_PROVIDER, or (back-compat) whenever
        // AZURE_SEARCH_ENDPOINT is set. Default only when explicitly selected.
        {
            type: 'azure-ai-search',
            enabled: azureSelected || azureConfigured,
            isDefault: azureSelected,
            config: {
                endpoint: process.env.AZURE_SEARCH_ENDPOINT ?? '',
                apiKey: process.env.AZURE_SEARCH_API_KEY ?? '',
                apiVersion: process.env.AZURE_SEARCH_API_VERSION ?? '2024-07-01',
            },
        },
    ],
};
