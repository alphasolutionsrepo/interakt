// src/features/search/providers/capabilities-by-provider.ts

/**
 * Each provider's static capabilities by provider type, for code that has only the
 * index's searchProvider (shared helpers, the browser). Imports no provider code, so
 * client components can use it.
 */

import { AZURE_AI_SEARCH_CAPABILITIES } from './azure-ai-search/azure-capabilities';
import { ELASTICSEARCH_CAPABILITIES } from './elasticsearch/elasticsearch-capabilities';
import type { ProviderCapabilities } from './provider-capabilities';
import type { SearchProviderType } from './search-engine-provider.interface';

const CAPABILITIES: Record<SearchProviderType, ProviderCapabilities> = {
    elasticsearch: ELASTICSEARCH_CAPABILITIES,
    'azure-ai-search': AZURE_AI_SEARCH_CAPABILITIES,
};

/** The capabilities of a provider type, or undefined for none or an unknown one */
export function capabilitiesOf(searchProvider?: string): ProviderCapabilities | undefined {
    return searchProvider && Object.hasOwn(CAPABILITIES, searchProvider)
        ? CAPABILITIES[searchProvider as SearchProviderType]
        : undefined;
}
