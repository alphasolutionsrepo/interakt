// src/features/search/providers/search-engine-provider.interface.ts

/**
 * Search Engine Provider - Provider-Agnostic Interfaces
 *
 * Defines the full contract for search engine operations including
 * index lifecycle, document operations, field mapping, and health checks.
 *
 * Providers (Elasticsearch, Azure AI Search, etc.) implement these
 * interfaces to plug into the search system.
 *
 * Note: The SearchProvider interface (search-provider.interface.ts) handles
 * search-time operations at a higher abstraction level (ProviderSearchRequest).
 * SearchEngineProvider handles the lower-level index/document infrastructure.
 */

import 'server-only';

import type { ProviderCapabilities } from './provider-capabilities';
import type { FilterClause, SearchContext } from '../search.types';

// ============================================================================
// PROVIDER TYPE IDENTIFIER
// ============================================================================

/**
 * Supported search engine provider types.
 *
 * To add a new provider:
 * 1. Add the type here
 * 2. Implement the SearchEngineProvider interface
 * 3. Add the provider entry to config/search-provider.config.ts
 */
export type SearchProviderType = 'elasticsearch' | 'azure-ai-search';

// ============================================================================
// INDEX LIFECYCLE TYPES
// ============================================================================

/**
 * Options for creating a new search index.
 *
 * These are provider-agnostic — callers pass opaque settings/mappings
 * produced by the provider's buildIndexSettings() method.
 */
export interface CreateIndexOptions {
    /** Provider-specific index settings (analyzers, shards, vector config, etc.) */
    settings?: Record<string, unknown>;
    /** Field-level mapping definitions in provider-native format */
    mappings?: Record<string, unknown>;
}

// ============================================================================
// INDEX SETTINGS BUILD CONTEXT
// ============================================================================

/**
 * Context passed to a provider's buildIndexSettings() method.
 *
 * The service layer collects field definitions and settings from the DB,
 * then passes this context so the provider can produce its native config.
 */
export interface IndexSettingsBuildContext {
    /** Fields to include in the index with their types and provider-specific settings */
    fields: Array<{
        fieldName: string;
        fieldType: string;
        isSearchable?: boolean;
        isFacetable?: boolean;
        isAutocomplete?: boolean;
        /** Provider-specific field settings (from providerFieldSettings JSON column) */
        providerFieldSettings: Record<string, unknown>;
    }>;
    /** Provider-specific index settings (from providerSettings JSON column) */
    providerSettings: Record<string, unknown>;
    /** Embedding/vector field configuration (if semantic/hybrid search) */
    embeddingConfig?: {
        fieldName: string;
        dimensions: number;
        similarity: string;
    };
    /**
     * Synonym rules in Solr format (e.g. "bags => handbags", "tv, television").
     * Applied at search time so queries match equivalent terms. Each provider
     * maps these into its native mechanism (Azure synonym map, ES synonym filter).
     */
    synonyms?: string[];
}

/**
 * Result of buildIndexSettings() — ready to pass to createIndex().
 */
export interface IndexSettingsResult {
    /** Provider-specific index settings (analyzers, shard config, vector search config, etc.) */
    settings?: Record<string, unknown>;
    /** Field mappings in provider-native format */
    mappings: Record<string, unknown>;
}

/**
 * Result of a simple success/failure operation (create, delete, etc.)
 */
export interface OperationResult {
    success: boolean;
    error?: string;
}

/**
 * Index-level statistics.
 */
export interface IndexStats {
    /** Total number of documents in the index */
    documentCount: number;
    /** Total index size in bytes */
    sizeInBytes: number;
    /** Index health status */
    health: 'green' | 'yellow' | 'red' | 'unknown';
}

/**
 * Result of retrieving an index's field mapping.
 */
export interface IndexMappingResult {
    success: boolean;
    /** The raw mapping object (provider-specific structure) */
    mapping?: Record<string, unknown>;
    /** Detected embedding/vector field dimensions (if any) */
    embeddingDimensions?: number;
    error?: string;
}

// ============================================================================
// DOCUMENT TYPES
// ============================================================================

/**
 * A document to be bulk-indexed.
 * The _id field is optional — if omitted, the provider generates one.
 */
export interface BulkDocument {
    _id?: string;
    [key: string]: unknown;
}

/**
 * Result of a bulk indexing operation.
 */
export interface BulkIndexResult {
    /** Whether all documents were indexed successfully */
    success: boolean;
    /** Number of documents successfully indexed */
    indexed: number;
    /** Number of documents that failed to index */
    failed: number;
    /** Per-document error details */
    errors: Array<{
        /** Position in the original documents array */
        index: number;
        /** Document ID (if available) */
        id?: string;
        /** Error message */
        error: string;
    }>;
    /** Total operation time in milliseconds */
    took: number;
}

/**
 * A single write action in a bulk write.
 *
 * - `upload` — full document replace (create if absent)
 * - `merge`  — partial update; unlisted fields keep their stored values
 * - `delete` — remove the document by key
 *
 * Semantics are normalized across providers: `upload` maps to an ES `index` op
 * / Azure `uploadDocuments`, `merge` to an ES `update` with `doc_as_upsert`
 * / Azure `mergeOrUploadDocuments`, `delete` to an ES `delete` op
 * / Azure `deleteDocuments`.
 */
export type BulkWriteAction = 'upload' | 'merge' | 'delete';

/**
 * One operation in a mixed-action bulk write.
 */
export interface BulkWriteOperation {
    action: BulkWriteAction;
    /**
     * Provider document key. Required for `merge` and `delete`.
     * Optional for `upload` — the provider generates one if omitted.
     */
    _id?: string;
    /** Field values. Required for `upload`/`merge`, ignored for `delete`. */
    document?: Record<string, unknown>;
}

/**
 * Result of a mixed-action bulk write.
 */
export interface BulkWriteResult extends BulkIndexResult {
    /** Successful operation counts broken down by action. */
    counts: Record<BulkWriteAction, number>;
}

/**
 * A document returned by a listing/sampling read.
 *
 * `fields` never contains the embedding vector — it is excluded at the provider
 * level so a 1536-float array never travels to a caller that just wants to show
 * a document.
 */
export interface ListedDocument {
    id: string;
    fields: Record<string, unknown>;
}

/**
 * Result of a paged document listing.
 */
export interface ListDocumentsResult {
    success: boolean;
    documents: ListedDocument[];
    /** Exact total document count in the index, for pagination. */
    total: number;
    error?: string;
}

/**
 * Result of a delete-by-filter operation.
 */
export interface DeleteByFilterResult {
    success: boolean;
    /** Documents matching the filter. */
    matched: number;
    /** Documents actually deleted (0 for a dry run). */
    deleted: number;
    /**
     * Sample of the matching documents, so a caller can see *what* a filter
     * caught rather than just how much. Populated on a dry run only.
     */
    sample?: ListedDocument[];
    error?: string;
}

/**
 * A document fetched via scroll/pagination (used during reindexing).
 */
export interface ScrollDocument {
    _id: string;
    _source: Record<string, unknown>;
}

/**
 * Result of fetching all documents from an index.
 */
export interface FetchAllResult {
    success: boolean;
    /** All fetched documents */
    documents: ScrollDocument[];
    error?: string;
}

/**
 * Result of getting a single document by ID.
 */
export interface GetDocumentResult {
    /** Whether the document was found */
    found: boolean;
    /** Document ID */
    id?: string;
    /** Document source fields */
    source?: Record<string, unknown>;
    error?: string;
}

// ============================================================================
// HEALTH TYPES
// ============================================================================

/**
 * Provider health status information.
 */
export interface ProviderHealthStatus {
    /** Whether the provider is reachable */
    connected: boolean;
    /** Cluster/service name */
    clusterName?: string;
    /** Overall health status */
    clusterStatus?: 'green' | 'yellow' | 'red';
    /** Number of nodes in the cluster (if applicable) */
    numberOfNodes?: number;
    /** Provider software version */
    version?: string;
    /** Error message if connection failed */
    error?: string;
    /** Additional provider-specific health details */
    details?: Record<string, unknown>;
}

// ============================================================================
// SUB-INTERFACES
// ============================================================================

/**
 * Index lifecycle operations.
 *
 * Covers creating, deleting, and inspecting search indexes.
 */
export interface IndexProvider {
    /** Check if an index exists */
    indexExists(indexName: string): Promise<boolean>;

    /** Create an index with settings and mappings */
    createIndex(indexName: string, options?: CreateIndexOptions): Promise<OperationResult>;

    /** Delete an index */
    deleteIndex(indexName: string): Promise<OperationResult>;

    /** Get index statistics (document count, size, health) */
    getIndexStats(indexName: string): Promise<IndexStats | null>;

    /** Get index mapping (including embedding dimensions if present) */
    getIndexMapping(indexName: string): Promise<IndexMappingResult>;

    /** Refresh an index to make recent changes searchable (no-op for providers that auto-commit) */
    refreshIndex(indexName: string): Promise<boolean>;
}

/**
 * Document CRUD operations.
 *
 * Covers bulk indexing, fetching, and single-document operations.
 */
export interface DocumentProvider {
    /**
     * Bulk index multiple documents (full replace).
     *
     * Convenience wrapper over bulkWrite() with action 'upload' for every document.
     */
    bulkIndex(
        indexName: string,
        documents: BulkDocument[],
        options?: { refresh?: boolean | 'wait_for' }
    ): Promise<BulkIndexResult>;

    /**
     * Apply a batch of mixed write actions (upload / merge / delete).
     *
     * Errors are reported per operation using the caller's array positions, so a
     * partial failure never loses track of which operation failed.
     */
    bulkWrite(
        indexName: string,
        operations: BulkWriteOperation[],
        options?: { refresh?: boolean | 'wait_for' }
    ): Promise<BulkWriteResult>;

    /**
     * List documents in index order, one page at a time.
     *
     * Distinct from fetchAllDocuments(), which pulls the whole index into memory
     * for reindexing. This is the read behind an admin browse screen, so it talks
     * straight to the provider and is unaffected by application-level index
     * status flags.
     *
     * Ordering: providers sort by `sortField` when they can. Elasticsearch always
     * can; Azure's key field is declared non-sortable, so it falls back to
     * provider-defined order and paging is best-effort there.
     */
    listDocuments(
        indexName: string,
        options?: {
            offset?: number;
            limit?: number;
            /** Field allowlist. Omit to return everything except the embedding vector. */
            fields?: string[];
            /** Field to sort by for stable paging, when the provider supports it. */
            sortField?: string;
        }
    ): Promise<ListDocumentsResult>;

    /**
     * Delete every document matching a provider-native filter expression.
     *
     * Build the expression with buildFilterExpression() rather than constructing
     * it by hand — the shape is provider-specific (ES query DSL vs OData string).
     *
     * On a dry run, pass `sampleSize` to also get back a sample of what would be
     * deleted; `sampleFields` narrows which fields each sample carries.
     */
    deleteByFilter(
        indexName: string,
        filterExpression: unknown,
        options?: {
            refresh?: boolean;
            dryRun?: boolean;
            sampleSize?: number;
            sampleFields?: string[];
        }
    ): Promise<DeleteByFilterResult>;

    /** Fetch all documents from an index (for reindexing operations) */
    fetchAllDocuments(
        indexName: string,
        options?: { batchSize?: number; scrollTimeout?: string }
    ): Promise<FetchAllResult>;

    /** Get a single document by ID */
    getDocumentById(indexName: string, documentId: string): Promise<GetDocumentResult>;

    /** Index (upsert) a single document */
    indexDocument(
        indexName: string,
        documentId: string,
        document: Record<string, unknown>,
        options?: { refresh?: boolean }
    ): Promise<OperationResult>;

    /** Delete a single document */
    deleteDocument(
        indexName: string,
        documentId: string,
        options?: { refresh?: boolean }
    ): Promise<OperationResult>;
}

/**
 * Field type mapper.
 *
 * Maps internal/logical field types (e.g., 'text', 'keyword', 'float')
 * to provider-specific mapping definitions.
 */
export interface FieldMapper {
    /**
     * Map a field definition to provider-specific mapping.
     *
     * @param field - Field properties from the search index configuration
     * @returns Provider-specific mapping object, or null if the type is unsupported
     */
    mapFieldType(field: {
        fieldType: string;
        isAutocomplete?: boolean;
        isFacetable?: boolean;
        customAnalyzer?: string | null;
        /** Provider-specific field settings (from providerFieldSettings JSON column) */
        providerFieldSettings?: Record<string, unknown>;
    }): Record<string, unknown> | null;

    /**
     * Get the correct field path for aggregation/faceting queries.
     *
     * Some providers require a different field path for aggregations
     * (e.g., Elasticsearch needs '.keyword' suffix for text fields).
     *
     * @param fieldName - The logical field name
     * @param fieldType - The field's data type
     * @returns The provider-specific field path for aggregation
     */
    getAggregationFieldPath(fieldName: string, fieldType: string): string;

    /**
     * Build the vector/embedding field mapping in provider-native format.
     *
     * ES returns: { type: 'dense_vector', dims, index: true, similarity }
     * Azure returns: { type: 'Collection(Edm.Single)', dimensions, vectorSearchProfile }
     *
     * @param config - Vector field configuration
     * @returns Provider-specific mapping for the vector field
     */
    mapVectorField(config: {
        fieldName: string;
        dimensions: number;
        similarity: string;
    }): Record<string, unknown>;
}

// ============================================================================
// COMPOSITE INTERFACE
// ============================================================================

/**
 * Complete search engine provider.
 *
 * Combines index lifecycle, document operations, health checks,
 * and field mapping into a single provider contract.
 *
 * Implementations:
 * - ElasticsearchEngineProvider (built-in)
 * - AzureAISearchEngineProvider (planned)
 *
 * @example
 * ```typescript
 * const provider = getSearchEngineProvider('elasticsearch');
 *
 * // Index lifecycle
 * await provider.createIndex('products', { mappings: { ... } });
 * await provider.bulkIndex('products', documents);
 * const stats = await provider.getIndexStats('products');
 *
 * // Health check
 * const health = await provider.checkHealth();
 * ```
 */
export interface SearchEngineProvider extends IndexProvider, DocumentProvider {
    /** Human-readable provider name for logging and identification */
    readonly name: string;

    /** Provider type identifier (matches config key) */
    readonly type: SearchProviderType;

    /** Check provider connectivity and health */
    checkHealth(): Promise<ProviderHealthStatus>;

    /** Get the field mapper for converting field types to provider-specific mappings */
    getFieldMapper(): FieldMapper;

    /**
     * Get provider capabilities descriptor.
     *
     * Used by the service layer and frontend to adapt behavior
     * based on what this provider supports (search types, vector config,
     * index settings schema, field settings schema, etc.).
     */
    getCapabilities(): ProviderCapabilities;

    /**
     * Build provider-native index settings from application-level definitions.
     *
     * The service layer passes field definitions, provider settings, and embedding
     * config. The provider returns its native index creation payload (settings + mappings).
     *
     * This centralizes all provider-specific mapping logic (field types, vector fields,
     * analyzers, etc.) inside the provider, keeping the service layer clean.
     */
    buildIndexSettings(context: IndexSettingsBuildContext): IndexSettingsResult;

    /**
     * Translate application-level filter clauses into this provider's native
     * filter expression (ES query DSL object, Azure OData `$filter` string, ...).
     *
     * Keeps filter translation inside the provider so callers such as
     * deleteByFilter() stay provider-agnostic. Uses the same filter builders as
     * search, so filter semantics match the search API exactly.
     *
     * @throws SearchError when a clause references an unfilterable field
     */
    buildFilterExpression(filters: FilterClause[], context: SearchContext): unknown;

    /**
     * Map a provider-specific error to a standardized error descriptor.
     *
     * Enables consistent error handling across providers without the service
     * layer needing to understand provider-specific error formats.
     */
    mapError(error: unknown): { code: string; message: string; retryable: boolean };

    /** Close/cleanup provider connections (for graceful shutdown) */
    close(): Promise<void>;
}
