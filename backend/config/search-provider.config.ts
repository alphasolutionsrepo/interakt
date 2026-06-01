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
// CONFIGURATION
// ============================================================================

export const searchProvidersConfig: SearchProvidersConfig = {
    providers: [
        // ============================================================
        // ELASTICSEARCH
        // ============================================================
        {
            type: 'elasticsearch',
            enabled: true,
            isDefault: true,
            // ES connection settings are managed via config/elasticsearch.config.ts
        },

        // ============================================================
        // AZURE AI SEARCH
        // ============================================================
        // Enabled when AZURE_SEARCH_ENDPOINT is set in environment.
        {
            type: 'azure-ai-search',
            enabled: !!process.env.AZURE_SEARCH_ENDPOINT,
            isDefault: false,
            config: {
                endpoint: process.env.AZURE_SEARCH_ENDPOINT ?? '',
                apiKey: process.env.AZURE_SEARCH_API_KEY ?? '',
                apiVersion: process.env.AZURE_SEARCH_API_VERSION ?? '2024-07-01',
            },
        },
    ],
};
