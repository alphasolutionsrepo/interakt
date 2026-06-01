// src/features/search/providers/azure-ai-search/azure-capabilities.ts

/**
 * Azure AI Search Provider Capabilities
 *
 * Declares what Azure AI Search supports for use by the service layer
 * and frontend to adapt behavior dynamically.
 */

import type { ProviderCapabilities } from '../provider-capabilities';

export const AZURE_AI_SEARCH_CAPABILITIES: ProviderCapabilities = {
    type: 'azure-ai-search',
    displayName: 'Azure AI Search',
    description: 'Microsoft Azure\'s fully managed cloud search service with built-in AI enrichment, semantic ranking, and native hybrid search.',

    supportedSearchTypes: ['lexical', 'semantic', 'hybrid'],

    // Azure AI Search has built-in hybrid (RRF) support — no custom fusion needed
    supportsNativeHybrid: true,

    // Azure supports a built-in semantic ranker (L2 reranking)
    supportsSemanticRanker: true,

    // Azure uses suggesters (configured at index creation time via buildIndexSettings)
    supportsAutocomplete: true,

    vectorConfig: {
        supportedSimilarities: ['cosine', 'dot_product', 'euclidean'],
        supportedAlgorithms: ['hnsw', 'exhaustiveKnn'],
        maxDimensions: 3072,
    },

    indexing: {
        maxDocumentsPerBatch: 1000,
        supportsRefreshControl: false,
    },

    // Standard field attribute support
    fieldAttributes: {
        supportsAutocomplete: true, // Azure uses suggesters (defined at index creation for autocomplete fields)
        supportsCustomAnalyzer: true,
        analyzerOptions: [
            { value: 'standard.lucene', label: 'Standard (Lucene)' },
            { value: 'en.microsoft', label: 'English (Microsoft)' },
            { value: 'en.lucene', label: 'English (Lucene)' },
            { value: 'es.microsoft', label: 'Spanish (Microsoft)' },
            { value: 'fr.microsoft', label: 'French (Microsoft)' },
            { value: 'de.microsoft', label: 'German (Microsoft)' },
            { value: 'keyword', label: 'Keyword (no analysis)' },
        ],
    },

    // Index-level settings shown in the wizard/edit UI
    indexSettingsSchema: [
        {
            key: 'vectorSearchAlgorithm',
            label: 'Vector Search Algorithm',
            description: 'Algorithm for approximate nearest neighbor search.',
            type: 'select',
            options: [
                { value: 'hnsw', label: 'HNSW (Hierarchical Navigable Small World)' },
                { value: 'exhaustiveKnn', label: 'Exhaustive KNN (Brute Force)' },
            ],
            defaultValue: 'hnsw',
            requiresReindex: true,
        },
        {
            key: 'hnswM',
            label: 'HNSW M (Bi-directional Links)',
            description: 'Number of bi-directional links per node. Higher = better recall, more memory.',
            type: 'number',
            min: 4,
            max: 10,
            defaultValue: 4,
            requiresReindex: true,
        },
        {
            key: 'hnswEfConstruction',
            label: 'HNSW efConstruction',
            description: 'Size of the dynamic candidate list during index construction.',
            type: 'number',
            min: 100,
            max: 1000,
            defaultValue: 400,
            requiresReindex: true,
        },
        {
            key: 'hnswEfSearch',
            label: 'HNSW efSearch',
            description: 'Size of the dynamic candidate list during search.',
            type: 'number',
            min: 100,
            max: 1000,
            defaultValue: 500,
            requiresReindex: false,
        },
        {
            key: 'semanticConfigName',
            label: 'Semantic Configuration Name',
            description: 'Name for the semantic configuration profile.',
            type: 'string',
            defaultValue: 'default-semantic-config',
            requiresReindex: true,
        },
    ],

    // Per-field settings shown in the field mapping UI
    fieldSettingsSchema: [
        {
            key: 'isSortable',
            label: 'Enable Sorting',
            description: 'Allow sorting by this field in search results.',
            type: 'boolean',
            defaultValue: false,
            requiresReindex: true,
        },
    ],
};
