// src/features/search/providers/azure-ai-search/azure-engine.provider.ts

/**
 * Azure AI Search Engine Provider
 *
 * Implements SearchEngineProvider for Azure AI Search.
 * Handles index lifecycle, document CRUD, and index settings building.
 */

import 'server-only';

import { createLogger } from '@/shared/logger/logger';
import { AzureFieldMapper } from './azure-field-mapper';
import { AZURE_AI_SEARCH_CAPABILITIES } from './azure-capabilities';
import { AZURE_INDEX_DEFAULTS, SORTABLE_EDM_TYPES } from './azure-constants';
import {
    getIndexClient,
    getSearchClient,
    closeClients,
    checkAzureHealth,
} from './azure-client';
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

const logger = createLogger('azure-engine-provider');

// ============================================================================
// SEMANTIC FIELD PRIORITIZATION
// ============================================================================

/** Long-form text types that carry the most semantic meaning. */
const RICH_TEXT_TYPES = new Set(['text', 'html', 'markdown', 'richtext']);

/** Field name patterns that indicate primary content (checked in priority order). */
const HIGH_PRIORITY_PATTERNS = [
    /description/i,
    /\bname\b/i,
    /\btitle\b/i,
    /\bcontent\b/i,
    /\bsummary\b/i,
    /\bbody\b/i,
    /\boverview\b/i,
];

/** Field name patterns that indicate a good title field (short, identifying). */
const TITLE_PATTERNS = [/\btitle\b/i, /\bname\b/i, /\bheading\b/i, /\bsubject\b/i, /\blabel\b/i];

interface SemanticFieldSlots {
    /** Best single field for the title slot */
    titleField: string | null;
    /** Long-form text fields for the content slots (up to 10) */
    contentFields: string[];
    /** Keyword/tag fields for the keyword slots (up to 10) */
    keywordFields: string[];
}

/**
 * Categorize searchable fields into Azure semantic configuration slots.
 *
 * Azure semantic config has three slots:
 * - titleField (1): short identifying field (name, title, heading)
 * - contentFields (up to 10): rich text for semantic reranking
 * - keywordsFields (up to 10): keyword/tag fields for context
 */
function categorizeFieldsForSemantic(
    fields: Array<{ fieldName: string; fieldType: string }>
): SemanticFieldSlots {
    // Score and sort all fields by semantic relevance
    const scored = fields.map(f => {
        let score = 0;
        if (RICH_TEXT_TYPES.has(f.fieldType)) score += 100;
        for (let i = 0; i < HIGH_PRIORITY_PATTERNS.length; i++) {
            if (HIGH_PRIORITY_PATTERNS[i].test(f.fieldName)) {
                score += 50 - i * 5;
                break;
            }
        }
        if (f.fieldType === 'array' || f.fieldType === 'keyword') score -= 20;
        return { ...f, score };
    }).sort((a, b) => b.score - a.score);

    // Pick title field: prefer fields matching title/name patterns
    let titleField: string | null = null;
    for (const f of scored) {
        if (TITLE_PATTERNS.some(p => p.test(f.fieldName))) {
            titleField = f.fieldName;
            break;
        }
    }
    // Fallback: first non-keyword field
    if (!titleField && scored.length > 0) {
        const candidate = scored.find(f => f.fieldType !== 'array' && f.fieldType !== 'keyword');
        titleField = candidate?.fieldName ?? scored[0].fieldName;
    }

    // Content fields: text fields (excluding title), up to 10
    const contentFields = scored
        .filter(f => f.fieldName !== titleField && f.fieldType !== 'keyword' && f.fieldType !== 'array')
        .slice(0, 10)
        .map(f => f.fieldName);

    // Keyword fields: keyword/array type fields, up to 10
    const keywordFields = scored
        .filter(f => f.fieldName !== titleField && (f.fieldType === 'keyword' || f.fieldType === 'array'))
        .slice(0, 10)
        .map(f => f.fieldName);

    return { titleField, contentFields, keywordFields };
}

// ============================================================================
// AZURE AI SEARCH ENGINE PROVIDER
// ============================================================================

export class AzureEngineProvider implements SearchEngineProvider {
    readonly name = 'azure-ai-search';
    readonly type: SearchProviderType = 'azure-ai-search';

    private fieldMapper: AzureFieldMapper;

    constructor() {
        this.fieldMapper = new AzureFieldMapper();
    }

    // ========================================================================
    // INDEX LIFECYCLE
    // ========================================================================

    async indexExists(indexName: string): Promise<boolean> {
        try {
            const client = getIndexClient();
            await client.getIndex(indexName);
            return true;
        } catch (error: any) {
            if (error?.statusCode === 404) return false;
            throw error;
        }
    }

    async createIndex(indexName: string, options?: CreateIndexOptions): Promise<OperationResult> {
        try {
            const client = getIndexClient();

            // Synonym rules are passed through settings (see buildIndexSettings) but are
            // not a valid index property — pull them out before building the index def.
            const settings = { ...(options?.settings || {}) };
            const synonymRules = Array.isArray(settings.synonymRules)
                ? (settings.synonymRules as string[]).filter((r) => typeof r === 'string' && r.trim())
                : [];
            delete settings.synonymRules;

            // Build the Azure index definition from options
            const indexDef: Record<string, unknown> = {
                name: indexName,
                ...(options?.mappings || {}),
                ...settings,
            };

            // Apply synonyms: an Azure synonym map is a separate resource that must be
            // created before the index references it. We create/update one map per index
            // and attach it to every searchable string field so queries expand equivalents.
            if (synonymRules.length > 0) {
                const synonymMapName = `${indexName}-synonyms`;
                await client.createOrUpdateSynonymMap({ name: synonymMapName, synonyms: synonymRules });

                const fields = indexDef.fields as Array<Record<string, unknown>> | undefined;
                let attached = 0;
                if (Array.isArray(fields)) {
                    for (const f of fields) {
                        if (f.searchable === true &&
                            (f.type === 'Edm.String' || f.type === 'Collection(Edm.String)')) {
                            // SDK property is `synonymMapNames` (serializes to `synonymMaps` in REST).
                            // Using the REST name here causes the SDK to silently drop the attachment.
                            f.synonymMapNames = [synonymMapName];
                            attached++;
                        }
                    }
                }
                logger.info('Azure synonym map applied', {
                    indexName, synonymMapName, ruleCount: synonymRules.length, fieldsAttached: attached,
                });
            }

            logger.info('Azure createIndex payload', {
                indexName,
                hasSuggesters: !!indexDef.suggesters,
                suggesters: indexDef.suggesters ? JSON.stringify(indexDef.suggesters) : 'none',
                hasVectorSearch: !!indexDef.vectorSearch,
                hasSemanticSearch: !!indexDef.semanticSearch,
                fieldCount: Array.isArray(indexDef.fields) ? indexDef.fields.length : 0,
            });

            await client.createIndex(indexDef);
            logger.info('Azure index created', { indexName });
            return { success: true };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to create Azure index';
            logger.error('Failed to create Azure index', { indexName, error: message });
            return { success: false, error: message };
        }
    }

    async deleteIndex(indexName: string): Promise<OperationResult> {
        try {
            const client = getIndexClient();
            await client.deleteIndex(indexName);
            logger.info('Azure index deleted', { indexName });
            return { success: true };
        } catch (error: any) {
            if (error?.statusCode === 404) {
                return { success: true }; // Already doesn't exist
            }
            const message = error instanceof Error ? error.message : 'Failed to delete Azure index';
            logger.error('Failed to delete Azure index', { indexName, error: message });
            return { success: false, error: message };
        }
    }

    async getIndexStats(indexName: string): Promise<IndexStats | null> {
        try {
            const client = getIndexClient();
            const stats = await client.getIndexStatistics(indexName);
            return {
                documentCount: stats.documentCount ?? 0,
                sizeInBytes: stats.storageSize ?? 0,
                health: 'green', // Azure AI Search doesn't expose per-index health; assume green if stats succeed
            };
        } catch (error) {
            logger.error('Failed to get Azure index stats', { indexName, error });
            return null;
        }
    }

    async getIndexMapping(indexName: string): Promise<IndexMappingResult> {
        try {
            const client = getIndexClient();
            const indexDef = await client.getIndex(indexName);
            return {
                success: true,
                mapping: {
                    fields: indexDef.fields?.map((f: any) => ({
                        name: f.name,
                        type: f.type,
                        searchable: f.searchable,
                        filterable: f.filterable,
                        facetable: f.facetable,
                        sortable: f.sortable,
                    })) ?? [],
                },
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to get index mapping';
            return { success: false, error: message };
        }
    }

    async refreshIndex(_indexName: string): Promise<boolean> {
        // Azure AI Search doesn't have a manual refresh concept — documents are
        // available for search shortly after upload (near real-time).
        return true;
    }

    // ========================================================================
    // DOCUMENT OPERATIONS
    // ========================================================================

    async bulkIndex(
        indexName: string,
        documents: BulkDocument[],
        _options?: { refresh?: boolean | 'wait_for' }
    ): Promise<BulkIndexResult> {
        try {
            const client = getSearchClient(indexName);

            // Azure uses mergeOrUploadDocuments for upsert behavior
            const azureDocs = documents.map(doc => {
                const { _id, ...rest } = doc;
                const id = _id || rest.id;
                return { ...rest, id: String(id) };
            });

            // Azure allows max 1000 docs per batch
            const batchSize = 1000;
            let totalIndexed = 0;
            let totalFailed = 0;
            const errors: Array<{ index: number; id?: string; error: string }> = [];
            const startTime = Date.now();

            let globalIndex = 0;
            for (let i = 0; i < azureDocs.length; i += batchSize) {
                const batch = azureDocs.slice(i, i + batchSize);
                const result = await client.mergeOrUploadDocuments(batch);

                for (const r of result.results) {
                    if (r.succeeded) {
                        totalIndexed++;
                    } else {
                        totalFailed++;
                        errors.push({
                            index: globalIndex,
                            id: r.key || undefined,
                            error: r.errorMessage || 'Unknown error',
                        });
                    }
                    globalIndex++;
                }
            }

            return {
                success: totalFailed === 0,
                indexed: totalIndexed,
                failed: totalFailed,
                errors,
                took: Date.now() - startTime,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Bulk index failed';
            logger.error('Azure bulk index failed', { indexName, error: message });
            return {
                success: false,
                indexed: 0,
                failed: documents.length,
                errors: [{ index: 0, error: message }],
                took: 0,
            };
        }
    }

    async fetchAllDocuments(
        indexName: string,
        options?: { batchSize?: number }
    ): Promise<FetchAllResult> {
        try {
            const client = getSearchClient(indexName);
            const batchSize = options?.batchSize ?? 1000;
            const allDocs: Array<{ _id: string; _source: Record<string, unknown> }> = [];

            // Azure uses search with '*' and $top/$skip for pagination
            let skip = 0;
            let hasMore = true;

            while (hasMore) {
                const results = await client.search('*', {
                    top: batchSize,
                    skip,
                    includeTotalCount: true,
                });

                const batch: Array<{ _id: string; _source: Record<string, unknown> }> = [];
                for await (const result of results.results) {
                    const doc = result.document as Record<string, unknown>;
                    const id = (doc.id as string) || '';
                    // Remove Azure internal fields
                    const { id: _docId, ...source } = doc;
                    batch.push({ _id: id, _source: source });
                }

                allDocs.push(...batch);
                skip += batchSize;
                hasMore = batch.length === batchSize;
            }

            return {
                success: true,
                documents: allDocs,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to fetch documents';
            logger.error('Azure fetchAllDocuments failed', { indexName, error: message });
            return { success: false, error: message, documents: [] };
        }
    }

    async getDocumentById(indexName: string, documentId: string): Promise<GetDocumentResult> {
        try {
            const client = getSearchClient(indexName);
            const doc = await client.getDocument(documentId) as Record<string, unknown>;
            return {
                found: true,
                id: documentId,
                source: doc,
            };
        } catch (error: any) {
            if (error?.statusCode === 404) {
                return { found: false, error: 'Document not found' };
            }
            const message = error instanceof Error ? error.message : 'Failed to get document';
            return { found: false, error: message };
        }
    }

    async indexDocument(
        indexName: string,
        documentId: string,
        document: Record<string, unknown>,
        _options?: { refresh?: boolean }
    ): Promise<OperationResult> {
        try {
            const client = getSearchClient(indexName);
            await client.mergeOrUploadDocuments([{ ...document, id: documentId }]);
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
        _options?: { refresh?: boolean }
    ): Promise<OperationResult> {
        try {
            const client = getSearchClient(indexName);
            await client.deleteDocuments([{ id: documentId }]);
            return { success: true };
        } catch (error: any) {
            if (error?.statusCode === 404) {
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
        const result = await checkAzureHealth();
        return {
            connected: result.healthy,
            clusterName: 'azure-ai-search',
            error: result.error ?? undefined,
            details: result.error ? { error: result.error } : undefined,
        };
    }

    getFieldMapper(): FieldMapper {
        return this.fieldMapper;
    }

    getCapabilities(): ProviderCapabilities {
        return AZURE_AI_SEARCH_CAPABILITIES;
    }

    async close(): Promise<void> {
        closeClients();
    }

    // ========================================================================
    // BUILD INDEX SETTINGS
    // ========================================================================

    /**
     * Build Azure AI Search native index definition from app-level definitions.
     *
     * Produces the Azure index schema including:
     * - Fields with Edm types, searchable/filterable/facetable flags
     * - Vector search configuration (algorithms, profiles)
     * - Semantic configuration (for semantic ranker)
     *
     * The service layer calls this and passes the result to createIndex().
     */
    buildIndexSettings(context: IndexSettingsBuildContext): IndexSettingsResult {
        const fields: Record<string, unknown>[] = [];

        // Always add an 'id' field as the document key
        fields.push({
            name: 'id',
            type: 'Edm.String',
            key: true,
            searchable: false,
            filterable: true,
            sortable: false,
            facetable: false,
            retrievable: true,
        });

        // Map each field
        const searchableFields: Array<{ fieldName: string; fieldType: string }> = [];
        for (const field of context.fields) {
            const mapped = this.fieldMapper.mapFieldType({
                fieldType: field.fieldType,
                isFacetable: field.isFacetable,
                customAnalyzer: field.providerFieldSettings?.customAnalyzer as string | null | undefined,
            });
            if (mapped) {
                // Sortable: use explicit provider setting if present,
                // otherwise default to true for numeric/date types
                const edmType = mapped.type as string;
                const isSortable = field.providerFieldSettings?.isSortable !== undefined
                    ? field.providerFieldSettings.isSortable === true
                    : SORTABLE_EDM_TYPES.has(edmType);

                const fieldDef = {
                    name: field.fieldName,
                    ...mapped,
                    sortable: isSortable,
                };
                fields.push(fieldDef);

                // Track searchable text fields for semantic config
                if (field.isSearchable && mapped.searchable) {
                    searchableFields.push({ fieldName: field.fieldName, fieldType: field.fieldType });
                }
            }
        }

        // Settings object holds vectorSearch and semantic configs
        const settings: Record<string, unknown> = {};

        // Add vector field and vector search config if needed
        if (context.embeddingConfig) {
            const vectorField = this.fieldMapper.mapVectorField(context.embeddingConfig);
            fields.push({
                name: context.embeddingConfig.fieldName,
                ...vectorField,
            });

            const ps = context.providerSettings;
            const algorithm = (ps.vectorSearchAlgorithm as string) || AZURE_INDEX_DEFAULTS.vectorSearchAlgorithm;
            const hnswM = (ps.hnswM as number) || AZURE_INDEX_DEFAULTS.hnswM;
            const efConstruction = (ps.hnswEfConstruction as number) || AZURE_INDEX_DEFAULTS.hnswEfConstruction;
            const efSearch = (ps.hnswEfSearch as number) || AZURE_INDEX_DEFAULTS.hnswEfSearch;

            // Map similarity to Azure metric name
            const similarityMap: Record<string, string> = {
                cosine: 'cosine',
                dot_product: 'dotProduct',
                euclidean: 'euclidean',
            };
            const metric = similarityMap[context.embeddingConfig.similarity] || 'cosine';

            settings.vectorSearch = {
                algorithms: [
                    algorithm === 'hnsw'
                        ? {
                            name: 'default-hnsw',
                            kind: 'hnsw',
                            parameters: {
                                m: hnswM,
                                efConstruction,
                                efSearch,
                                metric,
                            },
                        }
                        : {
                            name: 'default-eknn',
                            kind: 'exhaustiveKnn',
                            parameters: { metric },
                        },
                ],
                profiles: [
                    {
                        name: 'default-vector-profile',
                        algorithmConfigurationName: algorithm === 'hnsw' ? 'default-hnsw' : 'default-eknn',
                    },
                ],
            };
        }

        // Add semantic configuration if there are searchable text fields
        if (searchableFields.length > 0) {
            const ps = context.providerSettings;
            const semanticConfigName = (ps.semanticConfigName as string) || AZURE_INDEX_DEFAULTS.semanticConfigName;

            // Categorize fields into title / content / keyword slots
            const slots = categorizeFieldsForSemantic(searchableFields);

            // SDK uses semanticSearch (REST API: semantic)
            // SDK SemanticField uses { name } which serializes to { fieldName } in REST API
            const prioritizedFields: Record<string, unknown> = {};

            if (slots.titleField) {
                prioritizedFields.titleField = { name: slots.titleField };
            }
            if (slots.contentFields.length > 0) {
                prioritizedFields.contentFields = slots.contentFields.map(n => ({ name: n }));
            }
            if (slots.keywordFields.length > 0) {
                prioritizedFields.keywordsFields = slots.keywordFields.map(n => ({ name: n }));
            }

            settings.semanticSearch = {
                configurations: [
                    {
                        name: semanticConfigName,
                        prioritizedFields,
                    },
                ],
            };
        }

        // Add suggester for autocomplete/suggest support
        // Azure suggesters must be defined at index creation time and reference
        // searchable Edm.String fields. Uses analyzingInfixMatching for partial matching.
        const autocompleteFieldNames = context.fields
            .filter(f => f.isAutocomplete && f.isSearchable)
            .map(f => f.fieldName);

        logger.info('Autocomplete field detection for suggester', {
            totalFields: context.fields.length,
            fieldsWithAutocomplete: context.fields.filter(f => f.isAutocomplete).map(f => f.fieldName),
            fieldsWithSearchable: context.fields.filter(f => f.isSearchable).map(f => f.fieldName),
            autocompleteAndSearchable: autocompleteFieldNames,
        });

        if (autocompleteFieldNames.length > 0) {
            settings.suggesters = [
                {
                    name: 'sg',
                    searchMode: 'analyzingInfixMatching',
                    sourceFields: autocompleteFieldNames,
                },
            ];
        }

        // Pass synonym rules through to createIndex. Azure synonym maps are a
        // separate service resource that must exist before the index references
        // them, so the actual map creation + field attachment happens in createIndex.
        if (context.synonyms && context.synonyms.length > 0) {
            settings.synonymRules = context.synonyms;
        }

        return {
            // Azure's createIndex expects fields at the top level, not nested under mappings.properties
            // We put fields in mappings so the generic flow works, then merge in createIndex.
            mappings: { fields },
            settings: Object.keys(settings).length > 0 ? settings : undefined,
        };
    }

    // ========================================================================
    // ERROR MAPPING
    // ========================================================================

    mapError(error: unknown): { code: string; message: string; retryable: boolean } {
        if (!error || typeof error !== 'object') {
            return { code: 'UNKNOWN_ERROR', message: 'Unknown error', retryable: false };
        }

        const statusCode = (error as any).statusCode;
        const message = (error as any).message ?? 'Azure AI Search error';

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

        if (message.includes('ServiceUnavailable') || message.includes('ECONNREFUSED')) {
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

registerProviderClass('azure-ai-search', () => new AzureEngineProvider());
