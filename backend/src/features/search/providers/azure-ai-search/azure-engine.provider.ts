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
import { buildAzureFilter } from './query-builders/filter.builder';
import type { ProviderCapabilities } from '../provider-capabilities';
import type { FilterClause, SearchContext } from '../../search.types';

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
    BulkWriteAction,
    BulkWriteOperation,
    BulkWriteResult,
    DeleteByFilterResult,
    ListedDocument,
    ListDocumentsResult,
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

// ============================================================================
// BULK WRITE HELPERS
// ============================================================================

/**
 * Azure's document key field name, as declared in buildIndexSettings.
 */
const AZURE_KEY_FIELD = 'id';

/** A run of consecutive operations sharing one action. */
interface ActionRun {
    action: BulkWriteAction;
    operations: BulkWriteOperation[];
    /** Original position in the caller's operations array, per entry above. */
    indices: number[];
}

/**
 * Split a mixed-action operation list into contiguous same-action runs.
 *
 * Azure's typed client exposes one method per action, so operations must be
 * grouped before submission. Grouping *contiguously* (rather than by action
 * globally) preserves the caller's ordering, which matters when the same
 * document id is written more than once in a single request.
 */
function groupContiguousByAction(operations: BulkWriteOperation[]): ActionRun[] {
    const runs: ActionRun[] = [];

    operations.forEach((operation, index) => {
        const last = runs[runs.length - 1];
        if (last && last.action === operation.action) {
            last.operations.push(operation);
            last.indices.push(index);
        } else {
            runs.push({
                action: operation.action,
                operations: [operation],
                indices: [index],
            });
        }
    });

    return runs;
}

/**
 * Split an Azure document into its key and its remaining fields.
 *
 * Azure returns the key inline as `id` (see buildIndexSettings) rather than as
 * separate metadata the way Elasticsearch does with `_id`, so it has to be lifted
 * back out to match ListedDocument.
 */
function toListedDocumentFromAzure(document: Record<string, unknown>): ListedDocument {
    const { id, ...fields } = document;
    return {
        id: id === undefined || id === null ? '' : String(id),
        fields,
    };
}

/**
 * Add the key field to a `select` allowlist.
 *
 * Azure only returns fields named in `select`, and the key is not implicit the way
 * Elasticsearch's `_id` is — omit it and every document comes back without an id,
 * leaving the caller unable to address the rows it just read.
 */
function withKeyField(fields: string[]): string[] {
    return fields.includes(AZURE_KEY_FIELD) ? fields : [AZURE_KEY_FIELD, ...fields];
}

/**
 * Convert an operation into the flat shape Azure expects.
 *
 * Azure's key field is always `id` (see buildIndexSettings), so the logical
 * document key — passed as `_id`, or already present as `id` — is normalized
 * onto that field. Deletes carry the key only.
 */
function toAzureDocument(
    operation: BulkWriteOperation,
    action: BulkWriteAction
): Record<string, unknown> {
    const { _id, document } = operation;
    const rest = document ?? {};
    const id = _id ?? rest.id;

    if (action === 'delete') {
        return { id: String(id) };
    }

    return { ...rest, id: String(id) };
}

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
        options?: { refresh?: boolean | 'wait_for' }
    ): Promise<BulkIndexResult> {
        return this.bulkWrite(
            indexName,
            documents.map(({ _id, ...document }) => ({
                action: 'upload' as const,
                _id,
                document,
            })),
            options
        );
    }

    async bulkWrite(
        indexName: string,
        operations: BulkWriteOperation[],
        _options?: { refresh?: boolean | 'wait_for' }
    ): Promise<BulkWriteResult> {
        const counts: Record<BulkWriteAction, number> = { upload: 0, merge: 0, delete: 0 };
        const errors: Array<{ index: number; id?: string; error: string }> = [];
        const startTime = Date.now();

        try {
            const client = getSearchClient(indexName);

            let totalSucceeded = 0;
            let totalFailed = 0;

            // Azure has no mixed-action batch on the typed client, so split into
            // contiguous same-action runs. Original array positions are carried
            // along so per-operation errors stay addressable by the caller.
            for (const run of groupContiguousByAction(operations)) {
                const azureDocs = run.operations.map(op =>
                    toAzureDocument(op, run.action)
                );

                // Azure allows max 1000 docs per batch
                const batchSize = 1000;
                for (let i = 0; i < azureDocs.length; i += batchSize) {
                    const batch = azureDocs.slice(i, i + batchSize);
                    const result = await this.submitAzureBatch(client, run.action, batch);

                    result.results.forEach((r, batchIndex) => {
                        // Original position of this operation in the caller's array
                        const originalIndex = run.indices[i + batchIndex];

                        // Deleting an absent document is not an error — deletes are
                        // idempotent, which keeps incremental sync retryable.
                        const isMissingOnDelete =
                            run.action === 'delete' && r.statusCode === 404;

                        if (r.succeeded || isMissingOnDelete) {
                            totalSucceeded++;
                            counts[run.action]++;
                        } else {
                            totalFailed++;
                            errors.push({
                                index: originalIndex,
                                id: r.key || undefined,
                                error: r.errorMessage || 'Unknown error',
                            });
                        }
                    });
                }
            }

            logger.info('Azure bulk write completed', {
                indexName,
                total: operations.length,
                succeeded: totalSucceeded,
                failed: totalFailed,
                counts,
            });

            return {
                success: totalFailed === 0,
                indexed: totalSucceeded,
                failed: totalFailed,
                errors,
                counts,
                took: Date.now() - startTime,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Bulk write failed';
            logger.error('Azure bulk write failed', { indexName, error: message });
            return {
                success: false,
                indexed: 0,
                failed: operations.length,
                errors: [{ index: 0, error: message }],
                counts,
                took: Date.now() - startTime,
            };
        }
    }

    /**
     * Dispatch one same-action batch to the matching Azure client method.
     *
     * upload → uploadDocuments        (full replace)
     * merge  → mergeOrUploadDocuments (partial update, creates when absent)
     * delete → deleteDocuments
     */
    private async submitAzureBatch(
        client: ReturnType<typeof getSearchClient>,
        action: BulkWriteAction,
        batch: Array<Record<string, unknown>>
    ) {
        switch (action) {
            case 'merge':
                return client.mergeOrUploadDocuments(batch);
            case 'delete':
                return client.deleteDocuments(batch);
            case 'upload':
            default:
                return client.uploadDocuments(batch);
        }
    }

    async listDocuments(
        indexName: string,
        options?: {
            offset?: number;
            limit?: number;
            fields?: string[];
            /**
             * Ignored on Azure: the key field is declared non-sortable in
             * buildIndexSettings, so orderby is unavailable and paging falls back
             * to provider-defined order (same as fetchAllDocuments).
             */
            sortField?: string;
        }
    ): Promise<ListDocumentsResult> {
        try {
            const client = getSearchClient(indexName);

            const results = await client.search('*', {
                top: options?.limit ?? 25,
                skip: options?.offset ?? 0,
                includeTotalCount: true,
                // Azure has no _source excludes — narrowing has to be an
                // allowlist. Omitting select returns every retrievable field;
                // vectors are typically non-retrievable, so they stay out.
                ...(options?.fields && options.fields.length > 0
                    ? { select: withKeyField(options.fields) }
                    : {}),
            });

            const documents: ListedDocument[] = [];
            for await (const result of results.results) {
                documents.push(toListedDocumentFromAzure(result.document as Record<string, unknown>));
            }

            return {
                success: true,
                documents,
                total: results.count ?? documents.length,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to list documents';
            logger.error('Azure list documents failed', { indexName, error: message });
            return { success: false, documents: [], total: 0, error: message };
        }
    }

    async deleteByFilter(
        indexName: string,
        filterExpression: unknown,
        options?: {
            refresh?: boolean;
            dryRun?: boolean;
            sampleSize?: number;
            sampleFields?: string[];
        }
    ): Promise<DeleteByFilterResult> {
        const filter = String(filterExpression);

        try {
            const client = getSearchClient(indexName);

            // Azure has no delete-by-query: page through the matches collecting
            // keys, then delete them in batches.
            const countResult = await client.search('*', {
                filter,
                top: 0,
                includeTotalCount: true,
            });
            const matched = countResult.count ?? 0;

            if (options?.dryRun) {
                const sampleSize = options.sampleSize ?? 0;

                if (sampleSize <= 0 || matched === 0) {
                    return { success: true, matched, deleted: 0, sample: [] };
                }

                const sampleResults = await client.search('*', {
                    filter,
                    top: sampleSize,
                    ...(options.sampleFields && options.sampleFields.length > 0
                        ? { select: withKeyField(options.sampleFields) }
                        : {}),
                });

                const sample: ListedDocument[] = [];
                for await (const result of sampleResults.results) {
                    sample.push(toListedDocumentFromAzure(result.document as Record<string, unknown>));
                }

                return { success: true, matched, deleted: 0, sample };
            }

            const keys: string[] = [];
            const pageSize = 1000;
            let skip = 0;
            let hasMore = true;

            while (hasMore) {
                const results = await client.search('*', {
                    filter,
                    select: ['id'],
                    top: pageSize,
                    skip,
                });

                let pageCount = 0;
                for await (const result of results.results) {
                    const doc = result.document as Record<string, unknown>;
                    if (doc.id !== undefined && doc.id !== null) {
                        keys.push(String(doc.id));
                    }
                    pageCount++;
                }

                skip += pageSize;
                hasMore = pageCount === pageSize;
            }

            let deleted = 0;
            for (let i = 0; i < keys.length; i += pageSize) {
                const batch = keys.slice(i, i + pageSize).map(id => ({ id }));
                const result = await client.deleteDocuments(batch);
                deleted += result.results.filter(
                    r => r.succeeded || r.statusCode === 404
                ).length;
            }

            logger.info('Azure delete by filter completed', { indexName, matched, deleted });

            return { success: true, matched, deleted };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Delete by filter failed';
            logger.error('Azure delete by filter failed', { indexName, error: message });
            return { success: false, matched: 0, deleted: 0, error: message };
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
    // FILTER TRANSLATION
    // ========================================================================

    /**
     * Translate filter clauses into an Azure OData $filter string.
     *
     * Reuses the same builder as search, so a filter that selects documents in
     * search selects exactly the same documents in deleteByFilter().
     */
    buildFilterExpression(filters: FilterClause[], context: SearchContext): unknown {
        // No filters would match every document — refuse rather than let a caller
        // accidentally purge an entire index.
        const filter = buildAzureFilter(filters, context.allFields);
        if (!filter) {
            throw new Error('At least one filter clause is required');
        }
        return filter;
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
