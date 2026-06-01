// src/features/search/providers/elasticsearch/elasticsearch-engine.provider.ts

/**
 * Elasticsearch Engine Provider
 *
 * Implements the SearchEngineProvider interface for Elasticsearch.
 * Delegates index/document operations to the existing elasticsearch.client.ts functions,
 * preserving exact behavior while satisfying the provider-agnostic contract.
 *
 * Also implements buildIndexSettings() which centralizes all ES-specific
 * mapping/settings logic (field types, analyzers, vector fields, shards, etc.)
 * so the service layer stays provider-agnostic.
 */

import 'server-only';

import {
    getElasticsearchClient,
    checkHealth as esCheckHealth,
    indexExists as esIndexExists,
    createIndex as esCreateIndex,
    deleteIndex as esDeleteIndex,
    getIndexStats as esGetIndexStats,
    getIndexMapping as esGetIndexMapping,
    refreshIndex as esRefreshIndex,
    bulkIndex as esBulkIndex,
    fetchAllDocuments as esFetchAllDocuments,
    getDocumentById as esGetDocumentById,
    closeClient as esCloseClient,
    type CreateIndexOptions as ESCreateIndexOptions,
    type BulkIndexDocument,
} from './elasticsearch.client';

import { createLogger } from '@/shared/logger/logger';
import { ElasticsearchFieldMapper } from './elasticsearch-field-mapper';
import { ELASTICSEARCH_CAPABILITIES } from './elasticsearch-capabilities';
import { AUTOCOMPLETE_ANALYZER_SETTINGS } from './elasticsearch.constants';
import { registerProviderClass } from '../search-engine-provider.factory';
import type { ProviderCapabilities } from '../provider-capabilities';

import type {
    SearchEngineProvider,
    SearchProviderType,
    CreateIndexOptions,
    IndexSettingsBuildContext,
    IndexSettingsResult,
    OperationResult,
    IndexStats,
    IndexMappingResult,
    BulkDocument,
    BulkIndexResult,
    FetchAllResult,
    GetDocumentResult,
    ProviderHealthStatus,
    FieldMapper,
} from '../search-engine-provider.interface';

const logger = createLogger('elasticsearch-engine-provider');

// ============================================================================
// ELASTICSEARCH ENGINE PROVIDER
// ============================================================================

export class ElasticsearchEngineProvider implements SearchEngineProvider {
    readonly name = 'elasticsearch';
    readonly type: SearchProviderType = 'elasticsearch';

    private fieldMapper: ElasticsearchFieldMapper;

    constructor() {
        this.fieldMapper = new ElasticsearchFieldMapper();
    }

    // ========================================================================
    // INDEX LIFECYCLE
    // ========================================================================

    async indexExists(indexName: string): Promise<boolean> {
        return esIndexExists(indexName);
    }

    async createIndex(indexName: string, options?: CreateIndexOptions): Promise<OperationResult> {
        // Pass through the provider-agnostic settings/mappings to the ES client.
        // The settings/mappings should already be in ES-native format
        // (produced by buildIndexSettings).
        const esOptions: ESCreateIndexOptions = {
            mappings: options?.mappings,
            settings: options?.settings,
        };

        return esCreateIndex(indexName, esOptions);
    }

    async deleteIndex(indexName: string): Promise<OperationResult> {
        return esDeleteIndex(indexName);
    }

    async getIndexStats(indexName: string): Promise<IndexStats | null> {
        return esGetIndexStats(indexName);
    }

    async getIndexMapping(indexName: string): Promise<IndexMappingResult> {
        return esGetIndexMapping(indexName);
    }

    async refreshIndex(indexName: string): Promise<boolean> {
        return esRefreshIndex(indexName);
    }

    // ========================================================================
    // DOCUMENT OPERATIONS
    // ========================================================================

    async bulkIndex(
        indexName: string,
        documents: BulkDocument[],
        options?: { refresh?: boolean | 'wait_for' }
    ): Promise<BulkIndexResult> {
        // BulkDocument and BulkIndexDocument have the same shape
        return esBulkIndex(indexName, documents as BulkIndexDocument[], options);
    }

    async fetchAllDocuments(
        indexName: string,
        options?: { batchSize?: number; scrollTimeout?: string }
    ): Promise<FetchAllResult> {
        return esFetchAllDocuments(indexName, options);
    }

    async getDocumentById(indexName: string, documentId: string): Promise<GetDocumentResult> {
        return esGetDocumentById(indexName, documentId);
    }

    async indexDocument(
        indexName: string,
        documentId: string,
        document: Record<string, unknown>,
        options?: { refresh?: boolean }
    ): Promise<OperationResult> {
        try {
            const es = getElasticsearchClient();
            await es.index({
                index: indexName,
                id: documentId,
                document,
                refresh: options?.refresh,
            });
            return { success: true };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to index document';
            logger.error('Failed to index document', { indexName, documentId, error: message });
            return { success: false, error: message };
        }
    }

    async deleteDocument(
        indexName: string,
        documentId: string,
        options?: { refresh?: boolean }
    ): Promise<OperationResult> {
        try {
            const es = getElasticsearchClient();
            await es.delete({
                index: indexName,
                id: documentId,
                refresh: options?.refresh,
            });
            return { success: true };
        } catch (error) {
            // Treat 404 as success (document already doesn't exist)
            if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
                return { success: true };
            }
            const message = error instanceof Error ? error.message : 'Failed to delete document';
            logger.error('Failed to delete document', { indexName, documentId, error: message });
            return { success: false, error: message };
        }
    }

    // ========================================================================
    // HEALTH & UTILITIES
    // ========================================================================

    async checkHealth(): Promise<ProviderHealthStatus> {
        return esCheckHealth();
    }

    getFieldMapper(): FieldMapper {
        return this.fieldMapper;
    }

    getCapabilities(): ProviderCapabilities {
        return ELASTICSEARCH_CAPABILITIES;
    }

    async close(): Promise<void> {
        return esCloseClient();
    }

    // ========================================================================
    // BUILD INDEX SETTINGS
    // ========================================================================

    /**
     * Build Elasticsearch-native index settings from app-level definitions.
     *
     * Handles:
     * - Field type mapping (text, keyword, integer, etc.)
     * - Autocomplete analyzer configuration (edge_ngram)
     * - Vector/embedding field (dense_vector)
     * - Index-level settings (shards, replicas, refresh interval)
     *
     * The service layer calls this and passes the result to createIndex().
     */
    buildIndexSettings(context: IndexSettingsBuildContext): IndexSettingsResult {
        const properties: Record<string, unknown> = {};

        // Map each field using the field mapper
        for (const field of context.fields) {
            const mapped = this.fieldMapper.mapFieldType({
                fieldType: field.fieldType,
                isFacetable: field.isFacetable,
                isAutocomplete: field.providerFieldSettings?.isAutocomplete as boolean | undefined,
                customAnalyzer: field.providerFieldSettings?.customAnalyzer as string | null | undefined,
            });
            if (mapped) {
                properties[field.fieldName] = mapped;
            }
        }

        // Add embedding vector field if needed
        if (context.embeddingConfig) {
            properties[context.embeddingConfig.fieldName] = this.fieldMapper.mapVectorField(context.embeddingConfig);
        }

        // Build index-level settings
        const indexSettings: Record<string, unknown> = {};

        // Add autocomplete analyzer settings if any field uses autocomplete
        const hasAutocomplete = context.fields.some(
            f => f.providerFieldSettings?.isAutocomplete === true
        );
        if (hasAutocomplete) {
            Object.assign(indexSettings, AUTOCOMPLETE_ANALYZER_SETTINGS);
        }

        // Apply synonyms as a search-time analyzer. We define a dedicated synonym
        // search analyzer and attach it as `search_analyzer` to searchable text fields,
        // so equivalent terms expand at query time. Synonyms only apply to analyzed
        // `text` fields — `keyword` fields (exact-match facets) are intentionally left
        // alone. Autocomplete fields keep their own analyzer and are not touched, so
        // type-ahead behavior is unchanged. We also register `default_search` as a
        // fallback for any text field that has no explicit search analyzer.
        // Existing analysis is spread into fresh objects so the shared autocomplete
        // constant is never mutated.
        const synonymRules = (context.synonyms ?? []).filter(r => typeof r === 'string' && r.trim());
        if (synonymRules.length > 0) {
            const synonymAnalyzer = { type: 'custom', tokenizer: 'standard', filter: ['lowercase', 'interakt_synonyms'] };
            const existing = (indexSettings.analysis as Record<string, unknown> | undefined) ?? {};
            indexSettings.analysis = {
                ...existing,
                filter: {
                    ...(existing.filter as Record<string, unknown> | undefined),
                    interakt_synonyms: { type: 'synonym_graph', synonyms: synonymRules, lenient: true },
                },
                analyzer: {
                    ...(existing.analyzer as Record<string, unknown> | undefined),
                    interakt_synonym_search: synonymAnalyzer,
                    default_search: synonymAnalyzer,
                },
            };

            // Attach to searchable text fields, skipping autocomplete fields (which keep
            // their own search_analyzer) and keyword fields (not analyzed).
            const autocompleteNames = new Set(
                context.fields.filter(f => f.providerFieldSettings?.isAutocomplete === true).map(f => f.fieldName)
            );
            for (const f of context.fields) {
                if (!f.isSearchable || autocompleteNames.has(f.fieldName)) continue;
                const prop = properties[f.fieldName] as Record<string, unknown> | undefined;
                if (prop && prop.type === 'text' && prop.search_analyzer === undefined) {
                    prop.search_analyzer = 'interakt_synonym_search';
                }
            }
        }

        // Extract ES-specific settings from providerSettings
        const ps = context.providerSettings;
        if (ps.numberOfShards) {
            indexSettings.number_of_shards = ps.numberOfShards;
        }
        if (ps.numberOfReplicas !== undefined) {
            indexSettings.number_of_replicas = ps.numberOfReplicas;
        }
        if (ps.refreshInterval) {
            indexSettings.refresh_interval = ps.refreshInterval;
        }

        return {
            settings: Object.keys(indexSettings).length > 0 ? indexSettings : undefined,
            mappings: { properties },
        };
    }

    // ========================================================================
    // ERROR MAPPING
    // ========================================================================

    /**
     * Map Elasticsearch-specific errors to a standardized format.
     *
     * Enables consistent error handling across providers without the service
     * layer needing to understand ES error formats.
     */
    mapError(error: unknown): { code: string; message: string; retryable: boolean } {
        if (!error || typeof error !== 'object') {
            return { code: 'UNKNOWN_ERROR', message: 'Unknown error', retryable: false };
        }

        const statusCode = (error as { statusCode?: number }).statusCode
            ?? (error as { meta?: { statusCode?: number } }).meta?.statusCode;
        const message = (error as { message?: string }).message ?? 'Elasticsearch error';

        // Map by HTTP status code
        switch (statusCode) {
            case 404:
                return { code: 'NOT_FOUND', message, retryable: false };
            case 400:
                return { code: 'INVALID_REQUEST', message, retryable: false };
            case 409:
                return { code: 'CONFLICT', message, retryable: true };
            case 429:
                return { code: 'RATE_LIMITED', message, retryable: true };
            case 503:
                return { code: 'UNAVAILABLE', message, retryable: true };
            default:
                break;
        }

        // Map by error message patterns
        if (message.includes('search_phase_execution_exception')) {
            return { code: 'INVALID_QUERY', message, retryable: false };
        }
        if (message.includes('index_not_found_exception')) {
            return { code: 'INDEX_NOT_FOUND', message, retryable: false };
        }
        if (message.includes('mapper_parsing_exception')) {
            return { code: 'MAPPING_ERROR', message, retryable: false };
        }
        if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND')) {
            return { code: 'CONNECTION_ERROR', message, retryable: true };
        }

        return {
            code: 'PROVIDER_ERROR',
            message,
            retryable: statusCode !== undefined && statusCode >= 500,
        };
    }
}

// ============================================================================
// AUTO-REGISTER WITH FACTORY
// ============================================================================

registerProviderClass('elasticsearch', () => new ElasticsearchEngineProvider());
