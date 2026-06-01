// src/features/search/providers/elasticsearch/elasticsearch-capabilities.ts

/**
 * Elasticsearch Provider Capabilities
 *
 * Declares what Elasticsearch supports for use by the service layer
 * and frontend to adapt behavior dynamically.
 */

import type { ProviderCapabilities } from '../provider-capabilities';

export const ELASTICSEARCH_CAPABILITIES: ProviderCapabilities = {
    type: 'elasticsearch',
    displayName: 'Elasticsearch',
    description: 'Open-source distributed search and analytics engine with powerful full-text search, vector search, and aggregations.',

    supportedSearchTypes: ['lexical', 'semantic', 'hybrid'],

    // ES does hybrid via custom RRF implementation (native RRF requires Platinum license)
    supportsNativeHybrid: false,

    // ES does not have a built-in neural reranker
    supportsSemanticRanker: false,

    // ES supports autocomplete via edge_ngram analyzer
    supportsAutocomplete: true,

    vectorConfig: {
        supportedSimilarities: ['cosine', 'dot_product', 'euclidean'],
        supportedAlgorithms: ['hnsw'],
        maxDimensions: 4096,
    },

    indexing: {
        maxDocumentsPerBatch: 10000,
        supportsRefreshControl: true,
    },

    // Standard field attribute support
    fieldAttributes: {
        supportsAutocomplete: true,
        supportsCustomAnalyzer: true,
        analyzerOptions: [
            { value: 'standard', label: 'Standard' },
            { value: 'simple', label: 'Simple' },
            { value: 'whitespace', label: 'Whitespace' },
            { value: 'keyword', label: 'Keyword (no analysis)' },
            { value: 'english', label: 'English' },
            { value: 'stop', label: 'Stop Words' },
        ],
    },

    // Index-level settings shown in the wizard/edit UI
    indexSettingsSchema: [
        {
            key: 'numberOfShards',
            label: 'Number of Shards',
            description: 'Number of primary shards for the index. More shards = better parallelism for large datasets.',
            type: 'number',
            min: 1,
            max: 100,
            defaultValue: 1,
            requiresReindex: true,
        },
        {
            key: 'numberOfReplicas',
            label: 'Number of Replicas',
            description: 'Number of replica copies. More replicas = better read availability but uses more storage.',
            type: 'number',
            min: 0,
            max: 10,
            defaultValue: 0,
            requiresReindex: false,
        },
        {
            key: 'refreshInterval',
            label: 'Refresh Interval',
            description: 'How often newly indexed documents become searchable.',
            type: 'select',
            options: [
                { value: '1s', label: '1 second' },
                { value: '5s', label: '5 seconds' },
                { value: '10s', label: '10 seconds' },
                { value: '30s', label: '30 seconds' },
                { value: '1m', label: '1 minute' },
                { value: '5m', label: '5 minutes' },
                { value: '-1', label: 'Disabled (manual refresh only)' },
            ],
            defaultValue: '1s',
            requiresReindex: false,
        },
    ],

    // Per-field settings shown in the field mapping UI
    fieldSettingsSchema: [
        {
            key: 'isAutocomplete',
            label: 'Enable Autocomplete',
            description: 'Use edge n-gram analyzer for type-ahead suggestions. Only applies to text fields.',
            type: 'boolean',
            defaultValue: false,
            requiresReindex: true,
            visibleWhen: {
                field: 'fieldType',
                value: 'text',
            },
        },
        {
            key: 'customAnalyzer',
            label: 'Custom Analyzer',
            description: 'Override the default text analyzer for this field.',
            type: 'string',
            defaultValue: '',
            requiresReindex: true,
            visibleWhen: {
                field: 'fieldType',
                value: 'text',
            },
        },
    ],
};
