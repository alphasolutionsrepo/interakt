// src/features/search/providers/init.ts

/**
 * Search Provider Initialization
 *
 * Reads the search providers config and registers only enabled providers
 * into the SearchProviderRegistry (search-time operations) and ensures
 * SearchEngineProvider classes are registered with the factory (lifecycle operations).
 *
 * Call once during application startup.
 */

import { searchProvidersConfig } from '../../../../config/search-provider.config';
import { providerRegistry } from './search-provider.interface';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('search-providers-init');

/**
 * Initialize search providers from configuration.
 *
 * Registers SearchProvider instances (search-time) into the providerRegistry
 * for each enabled provider in the config. SearchEngineProvider classes
 * (index/document lifecycle) auto-register with the factory on import.
 *
 * Safe to call multiple times — the registry's own state acts as the guard.
 * If providers are already registered, this is a no-op.
 */
export function initializeSearchProviders(): void {
    // Skip if providers are already registered
    if (providerRegistry.list().length > 0) return;

    for (const providerDef of searchProvidersConfig.providers) {
        if (!providerDef.enabled) {
            logger.debug('Skipping disabled provider', { type: providerDef.type });
            continue;
        }

        // Register search-time providers by type.
        // Each provider implementation module self-registers its SearchEngineProvider
        // class with the factory (via registerProviderClass). Here we register
        // the SearchProvider (search-time interface) into the registry.
        if (providerDef.type === 'elasticsearch') {
            const { ElasticsearchSearchProvider } = require('./elasticsearch/elasticsearch-search.provider');
            const esSearchProvider = new ElasticsearchSearchProvider();
            providerRegistry.register('elasticsearch', esSearchProvider, providerDef.isDefault);

            logger.info('Registered search provider', {
                type: 'elasticsearch',
                isDefault: providerDef.isDefault,
            });
        }

        if (providerDef.type === 'azure-ai-search') {
            const { AzureSearchProvider } = require('./azure-ai-search/azure-search.provider');
            const azureSearchProvider = new AzureSearchProvider();
            providerRegistry.register('azure-ai-search', azureSearchProvider, providerDef.isDefault);

            logger.info('Registered search provider', {
                type: 'azure-ai-search',
                isDefault: providerDef.isDefault,
            });
        }
    }

    logger.info('Search providers initialized', {
        registered: providerRegistry.list(),
        defaultProvider: providerRegistry.getDefault()
            ? 'available'
            : 'none',
    });
}
