// src/features/search/providers/azure-ai-search/index.ts

/**
 * Azure AI Search Provider — Barrel Export
 *
 * Importing this module triggers auto-registration of the Azure engine provider
 * with the factory (via registerProviderClass in azure-engine.provider.ts).
 */

// Import triggers auto-registration with the factory
import './azure-engine.provider';

// Public exports
export { AzureEngineProvider } from './azure-engine.provider';
export { AzureSearchProvider } from './azure-search.provider';
export { AzureFieldMapper } from './azure-field-mapper';
export { AZURE_AI_SEARCH_CAPABILITIES } from './azure-capabilities';
export {
    FIELD_TYPE_TO_EDM,
    AZURE_LANGUAGES,
    AZURE_INDEX_DEFAULTS,
} from './azure-constants';
export {
    getIndexClient,
    getSearchClient,
    closeClients,
} from './azure-client';
export { buildAzureSearchOptions, buildAzureFilter } from './query-builders';
