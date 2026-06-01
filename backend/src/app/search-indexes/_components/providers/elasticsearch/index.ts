// app/search-indexes/_components/providers/elasticsearch/index.ts

/**
 * Elasticsearch Provider UI Registration
 *
 * Auto-registers the Elasticsearch UI components with the provider registry.
 * Import this module to ensure ES provider UI is available.
 */

import { registerProviderUI } from '../provider-registry';
import { ElasticsearchSettingsForm } from './ElasticsearchSettingsForm';
import { ElasticsearchSettingsDisplay } from './ElasticsearchSettingsDisplay';
import { elasticsearchSettingsSchema, ELASTICSEARCH_DEFAULT_SETTINGS } from './elasticsearch-schema';

registerProviderUI({
    type: 'elasticsearch',
    label: 'Elasticsearch',
    description: 'Open-source distributed search and analytics engine with powerful full-text search, vector search, and aggregations.',
    SettingsForm: ElasticsearchSettingsForm,
    SettingsDisplay: ElasticsearchSettingsDisplay,
    settingsSchema: elasticsearchSettingsSchema,
    defaultSettings: ELASTICSEARCH_DEFAULT_SETTINGS,
});

export { ElasticsearchSettingsForm } from './ElasticsearchSettingsForm';
export { ElasticsearchSettingsDisplay } from './ElasticsearchSettingsDisplay';
export { elasticsearchSettingsSchema, ELASTICSEARCH_DEFAULT_SETTINGS } from './elasticsearch-schema';
