// src/features/search/providers/search-engine-provider.factory.ts

/**
 * Search Engine Provider Factory
 *
 * Config-driven factory for creating SearchEngineProvider instances.
 * Providers register themselves via registerProviderClass() — no switch
 * statements or hardcoded references to specific providers.
 *
 * To add a new provider:
 * 1. Implement SearchEngineProvider
 * 2. Call registerProviderClass() in the provider module (auto-registers on import)
 * 3. Add the provider entry to config/search-provider.config.ts
 */

import 'server-only';

import { searchProvidersConfig } from '@/config/search-provider.config';
import { createLogger } from '@/shared/logger/logger';
import type { SearchEngineProvider } from './search-engine-provider.interface';

const logger = createLogger('search-engine-provider-factory');

// ============================================================================
// PROVIDER CLASS REGISTRY
// ============================================================================

/**
 * Registry of provider constructor factories.
 * Each provider implementation calls registerProviderClass() to register
 * itself when its module is first imported.
 */
const providerClasses = new Map<string, () => SearchEngineProvider>();

/**
 * Register a provider class factory.
 *
 * Called by each provider implementation module on import:
 * ```typescript
 * registerProviderClass('elasticsearch', () => new ElasticsearchEngineProvider());
 * ```
 */
export function registerProviderClass(type: string, factory: () => SearchEngineProvider): void {
    providerClasses.set(type, factory);
    logger.debug('Provider class registered', { type });
}

// ============================================================================
// SINGLETON INSTANCE CACHE
// ============================================================================

const instances = new Map<string, SearchEngineProvider>();

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Get a SearchEngineProvider by type.
 *
 * Returns a cached singleton per provider type. The provider must be:
 * 1. Enabled in config/search-provider.config.ts
 * 2. Registered via registerProviderClass()
 *
 * @param type - Provider type identifier (e.g., 'elasticsearch', 'azure-ai-search')
 * @returns The provider instance
 * @throws Error if the provider is not enabled or not registered
 */
export function getSearchEngineProvider(type?: string): SearchEngineProvider {
    const providerType = type ?? getDefaultProviderType();

    // Return cached instance if available
    if (instances.has(providerType)) {
        return instances.get(providerType)!;
    }

    // Validate the provider is enabled in config
    const providerDef = searchProvidersConfig.providers.find(p => p.type === providerType);
    if (!providerDef || !providerDef.enabled) {
        throw new Error(
            `Search provider "${providerType}" is not enabled. ` +
            `Check config/search-provider.config.ts to enable it.`
        );
    }

    // Look up the registered factory
    const factory = providerClasses.get(providerType);
    if (!factory) {
        throw new Error(
            `Search provider "${providerType}" is enabled in config but has no registered implementation. ` +
            `Ensure the provider module is imported before use.`
        );
    }

    // Create and cache the instance
    const instance = factory();
    instances.set(providerType, instance);

    logger.info('Search engine provider created', {
        type: providerType,
        name: instance.name,
    });

    return instance;
}

/**
 * Get the default SearchEngineProvider (as configured).
 */
export function getDefaultSearchEngineProvider(): SearchEngineProvider {
    return getSearchEngineProvider(getDefaultProviderType());
}

/**
 * Get the default provider type from config.
 */
function getDefaultProviderType(): string {
    const defaultDef = searchProvidersConfig.providers.find(p => p.isDefault && p.enabled);
    return defaultDef?.type ?? 'elasticsearch';
}

/**
 * Get all enabled provider types from config.
 */
export function getEnabledProviderTypes(): string[] {
    return searchProvidersConfig.providers
        .filter(p => p.enabled)
        .map(p => p.type);
}

/**
 * Check if a provider type is enabled in config.
 */
export function isProviderEnabled(type: string): boolean {
    return searchProvidersConfig.providers.some(p => p.type === type && p.enabled);
}

/**
 * Close all cached provider instances (for graceful shutdown).
 */
export async function closeAllProviders(): Promise<void> {
    const closePromises = Array.from(instances.entries()).map(
        async ([type, provider]) => {
            try {
                await provider.close();
                logger.info('Provider closed', { type });
            } catch (error) {
                logger.error('Failed to close provider', {
                    type,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }
    );

    await Promise.all(closePromises);
    instances.clear();
}
