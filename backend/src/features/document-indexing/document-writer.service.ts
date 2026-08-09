// src/features/document-indexing/document-writer.service.ts

/**
 * Document Writer Service
 *
 * Incremental writes to an existing search index: add, update (full replace or
 * partial merge), and delete individual documents.
 *
 * This is the counterpart to document-indexer.service.ts, which handles full
 * uploads. The two differ in three important ways:
 *
 * 1. This service NEVER creates or recreates the provider index. `ensureIndex()`
 *    in the indexer may delete and rebuild an index on an embedding dimension
 *    mismatch — acceptable for a full push, catastrophic for a single-document
 *    PATCH. Incremental writes require the index to already exist.
 * 2. No indexing_batches row is written. These are small interactive operations,
 *    not tracked jobs; results are returned inline and logged.
 * 3. Embeddings are regenerated only when the write actually affects a vector
 *    source field (see resolveEmbeddings below).
 */

import 'server-only';

import { db } from '@/db/index';
import { searchIndex } from '@/db/schema/search-index.schema';
import { eq } from 'drizzle-orm';
import { createLogger } from '@/shared/logger/logger';
import { elasticsearchConfig } from '../../../config';
import {
    getSearchEngineProvider,
    type SearchProviderType,
} from '@/features/search/providers';
import type {
    BulkWriteOperation,
    ListedDocument,
    SearchEngineProvider,
} from '@/features/search/providers/search-engine-provider.interface';
import { buildSearchContext } from '@/features/search/search-context.builder';
import type { FilterClause, SearchContext } from '@/features/search/search.types';
import {
    DOCUMENT_KEY_FIELD,
    isFieldSelectionError,
    resolveDisplayColumns,
    sameColumns,
    toProviderFields,
    type DocumentColumn,
} from './document-columns';
import * as searchIndexService from '@/features/search-index/search-index.service';
import * as fieldsService from '@/features/search-index/search-index-fields.service';
import * as fieldsRepository from '@/features/search-index/search-index-fields.repository';
import { generateEmbeddings } from '@/features/ai-service';
import type { SearchIndexField } from '@/db/schema/search-index-fields.schema';
import { transformDocument } from './document-transformer.service';
import {
    buildEmbeddingPreview,
    getEmbeddingText,
    type EmbeddingPreview,
} from './embedding-text';
import {
    EMBEDDING_FIELD_NAME,
    getEmbeddingConfig,
    updateIndexStats,
    type EmbeddingConfig,
} from './document-indexer.service';

const logger = createLogger('document-writer');

// ============================================================================
// TYPES
// ============================================================================

/**
 * - `upload` — full replace; the stored document becomes exactly this payload
 * - `merge`  — partial update; fields absent from the payload keep their values
 * - `delete` — remove the document
 */
export type DocumentWriteAction = 'upload' | 'merge' | 'delete';

export interface DocumentWriteOperation {
    action: DocumentWriteAction;
    /** Source document (pre-transform). Required for upload/merge. */
    document?: Record<string, unknown>;
    /**
     * Explicit document id. Required for delete. For upload/merge it overrides
     * the id derived from the mapped uniqueId field — this is how the
     * single-document routes bind a write to the id in the URL.
     */
    documentId?: string;
}

export interface DocumentWriteError {
    /** Position in the caller's operations array */
    operationIndex: number;
    documentId?: string;
    error: string;
    field?: string;
}

export interface DocumentWriteResult {
    success: boolean;
    /** Operations submitted */
    total: number;
    /** Operations that succeeded */
    succeeded: number;
    /** Operations that failed */
    failed: number;
    /** Successful operation counts by action */
    counts: Record<DocumentWriteAction, number>;
    /** Embedding generation stats (semantic/hybrid indexes only) */
    embeddingStats?: {
        enabled: boolean;
        generated: number;
        failed: number;
        skipped: number;
    };
    errors: DocumentWriteError[];
    warnings: string[];
    durationMs: number;
}

export interface DocumentReadResult {
    found: boolean;
    documentId: string;
    document?: Record<string, unknown>;
    /** The text this document's vector was built from. Absent on lexical indexes. */
    embeddingPreview?: EmbeddingPreview;
}

export interface DeleteByFilterOutcome {
    /** Documents matching the filter */
    matched: number;
    /** Documents actually deleted (0 for a dry run) */
    deleted: number;
    /** Sample of matching documents — dry run only */
    sample: ListedDocument[];
    /** Compact column set for rendering the sample */
    columns: DocumentColumn[];
    dryRun: boolean;
    durationMs: number;
}

export interface ListDocumentsOutcome {
    documents: ListedDocument[];
    /** Total documents in the index */
    total: number;
    /** Compact column set for rendering the documents */
    columns: DocumentColumn[];
    page: number;
    pageSize: number;
}

/**
 * Thrown for conditions the API layer maps onto specific HTTP statuses:
 * 404 and 409 respectively.
 */
export class SearchIndexNotFoundError extends Error {}
export class IndexNotProvisionedError extends Error {}

// ============================================================================
// INDEX RESOLUTION
// ============================================================================

interface ResolvedIndex {
    id: string;
    /** Physical provider index name */
    name: string;
    provider: SearchEngineProvider;
    providerType: SearchProviderType;
    fields: SearchIndexField[];
    embeddingConfig: EmbeddingConfig;
    /**
     * Whether the field definitions have drifted from the provider mapping. When
     * true, a field row existing in Postgres is no proof the provider knows the
     * field, so optional columns are not requested.
     */
    requiresReindex: boolean;
}

/**
 * Load everything an incremental write needs, and verify the provider index
 * actually exists.
 *
 * Unlike the full-upload path this never creates the index: writing a single
 * document into an index that was never provisioned would produce a
 * dynamically-mapped index with none of the configured analyzers or vector
 * fields, which then silently misbehaves at search time.
 */
async function resolveIndex(searchIndexId: string): Promise<ResolvedIndex> {
    const [index] = await db.select()
        .from(searchIndex)
        .where(eq(searchIndex.id, searchIndexId))
        .limit(1);

    if (!index) {
        throw new SearchIndexNotFoundError('Search index not found');
    }

    const providerType = index.searchProvider as SearchProviderType;
    const provider = getSearchEngineProvider(providerType);

    const exists = await provider.indexExists(index.name);
    if (!exists) {
        throw new IndexNotProvisionedError(
            `Index "${index.name}" does not exist yet. Upload documents once to create it before making incremental changes.`
        );
    }

    const fields = await fieldsService.getFieldsBySearchIndexId(searchIndexId);

    return {
        id: index.id,
        name: index.name,
        provider,
        providerType,
        fields,
        embeddingConfig: getEmbeddingConfig(index),
        requiresReindex: index.requiresReindex ?? false,
    };
}

/**
 * Build the search context for an index WITHOUT the active/ready gate.
 *
 * searchService.getSearchContext() routes through resolveSearchIndex(), which
 * rejects any index that is inactive or not in a searchable status. That guard is
 * right for the public search path and wrong here: deactivating an index to clean
 * it up is exactly when you want to browse and purge it, and every other
 * operation in this service works on such an index because resolveIndex() only
 * checks that the provider index exists.
 *
 * The context itself is only used for field metadata — filter validation and
 * response-field selection — so skipping the gate changes nothing else.
 */
async function resolveSearchContextUngated(searchIndexId: string): Promise<SearchContext> {
    const index = await searchIndexService.getSearchIndexById(searchIndexId);
    if (!index) {
        throw new SearchIndexNotFoundError('Search index not found');
    }
    return buildSearchContext(index);
}

/**
 * Remove the embedding vector from a document read.
 *
 * provider.getDocumentById() returns the raw stored source, which on a
 * semantic/hybrid index includes a dense_vector of hundreds or thousands of
 * floats. Callers here are feeding a UI, so it is stripped at this boundary —
 * deliberately not inside the provider, because resolveEmbeddings() needs the
 * real stored document to rebuild a merge embedding.
 */
function withoutEmbedding(source: Record<string, unknown>): Record<string, unknown> {
    if (!(EMBEDDING_FIELD_NAME in source)) {
        return source;
    }
    const { [EMBEDDING_FIELD_NAME]: _vector, ...rest } = source;
    return rest;
}

// ============================================================================
// READ
// ============================================================================

/**
 * Fetch a single document from the provider index by id.
 *
 * The embedding preview travels with the document because the stored vector is
 * opaque — it is stripped from every read, and a wrong one looks identical to a
 * right one. Showing the text it was built from is the only way to see why a
 * document does or does not match semantically.
 */
export async function getDocument(
    searchIndexId: string,
    documentId: string
): Promise<DocumentReadResult> {
    const index = await resolveIndex(searchIndexId);
    const result = await index.provider.getDocumentById(index.name, documentId);

    const document = result.source ? withoutEmbedding(result.source) : undefined;

    return {
        found: result.found,
        documentId,
        document,
        embeddingPreview: document
            ? await buildDocumentEmbeddingPreview(index, document)
            : undefined,
    };
}

/**
 * Build the embedding preview for an already-fetched document.
 *
 * Returns undefined when the index does not embed at all — a lexical index has
 * no vector to explain, and showing an empty preview would imply otherwise.
 */
async function buildDocumentEmbeddingPreview(
    index: ResolvedIndex,
    document: Record<string, unknown>
): Promise<EmbeddingPreview | undefined> {
    if (!index.embeddingConfig.enabled) {
        return undefined;
    }
    const vectorSourceFields = await fieldsRepository.getVectorSourceFields(index.id);
    if (vectorSourceFields.length === 0) {
        return undefined;
    }
    return buildEmbeddingPreview(document, vectorSourceFields);
}

/**
 * List documents in an index, one page at a time.
 *
 * The compact column set travels with the result so a caller rendering a table
 * does not have to work out which fields are worth showing — and so the browse
 * table and the delete-by-filter preview agree on it.
 */
export async function listDocuments(
    searchIndexId: string,
    options: { page: number; pageSize: number }
): Promise<ListDocumentsOutcome> {
    const { page, pageSize } = options;

    const index = await resolveIndex(searchIndexId);

    // Generated timestamps (createdAt/updatedAt) are only requested when the field definitions are
    // known to match the provider mapping. Selecting a field Azure does not have throws, which
    // would fail the whole page rather than blank one column.
    const includeTimestamps = !index.requiresReindex;
    let columns = resolveDisplayColumns(index.fields, { includeTimestamps });

    const fetchPage = (forColumns: DocumentColumn[]) =>
        index.provider.listDocuments(index.name, {
            offset: (page - 1) * pageSize,
            limit: pageSize,
            fields: toProviderFields(forColumns, index.fields),
            // Only sort by the key when it is a real field; sorting on a field the
            // index does not define fails outright.
            ...(index.fields.some(f => f.fieldName === DOCUMENT_KEY_FIELD)
                ? { sortField: DOCUMENT_KEY_FIELD }
                : {}),
        });

    let result = await fetchPage(columns);

    // The requiresReindex flag is the primary guard, but it only catches drift the
    // platform recorded. If the *field selection* was rejected anyway, retry once
    // without the optional columns — browsing without a timestamp column beats not
    // browsing. Any other failure (auth, network, missing index) is left alone so
    // its error reaches the caller intact.
    if (!result.success && includeTimestamps && isFieldSelectionError(result.error)) {
        const fallbackColumns = resolveDisplayColumns(index.fields, { includeTimestamps: false });

        if (!sameColumns(columns, fallbackColumns)) {
            logger.warn('Document listing failed on field selection; retrying without optional columns', {
                searchIndexId,
                indexName: index.name,
                error: result.error,
            });

            const retry = await fetchPage(fallbackColumns);

            // Only adopt the retry when it worked. Otherwise `result` still holds the
            // original failure, so the error thrown below describes the real cause
            // rather than the retry's.
            if (retry.success) {
                columns = fallbackColumns;
                result = retry;
            }
        }
    }

    if (!result.success) {
        throw new Error(result.error || 'Failed to list documents');
    }

    return {
        documents: result.documents,
        total: result.total,
        columns,
        page,
        pageSize,
    };
}

// ============================================================================
// WRITE
// ============================================================================

/** A caller operation after transformation, ready to become a provider write. */
interface PreparedOperation {
    operationIndex: number;
    action: DocumentWriteAction;
    documentId: string;
    /** Transformed field values (absent for delete) */
    document?: Record<string, unknown>;
}

/**
 * Transform one operation's source payload and resolve its document id.
 *
 * Returns either a prepared operation or the error that disqualified it, so the
 * caller can report per-operation failures without aborting the whole batch.
 */
function prepareOperation(
    operation: DocumentWriteOperation,
    operationIndex: number,
    index: ResolvedIndex
): { prepared?: PreparedOperation; errors: DocumentWriteError[] } {
    const { action, document, documentId } = operation;

    if (action === 'delete') {
        if (!documentId) {
            return {
                errors: [{
                    operationIndex,
                    error: 'documentId is required for a delete operation',
                }],
            };
        }
        return {
            prepared: { operationIndex, action, documentId },
            errors: [],
        };
    }

    if (!document) {
        return {
            errors: [{
                operationIndex,
                error: `document is required for a ${action} operation`,
            }],
        };
    }

    const transformed = transformDocument(document, index.fields, {
        provider: index.providerType,
        partial: action === 'merge',
    });

    if (!transformed.success) {
        return {
            errors: transformed.errors.map(err => ({
                operationIndex,
                documentId,
                error: err.error,
                field: err.field,
            })),
        };
    }

    // An explicit id (from the route) wins over the mapped uniqueId, so a PUT to
    // /documents/:id always writes that id even if the body disagrees.
    const resolvedId = documentId ?? (transformed.document.uniqueId as string | undefined);

    if (!resolvedId) {
        return {
            errors: [{
                operationIndex,
                error: 'Could not determine a document id. Provide documentId, or map a uniqueId field with a value.',
                field: 'uniqueId',
            }],
        };
    }

    // Keep the stored uniqueId consistent with the key we write under.
    const fields = { ...transformed.document };
    if (documentId !== undefined && fields.uniqueId !== undefined) {
        fields.uniqueId = documentId;
    }

    return {
        prepared: {
            operationIndex,
            action,
            documentId: resolvedId,
            document: fields,
        },
        errors: [],
    };
}

/**
 * Decide which prepared operations need a fresh embedding, and attach it.
 *
 * - `upload` replaces the whole document, so the vector must always be rebuilt.
 * - `merge` only needs a new vector when the payload touches a vector source
 *   field. When it does, the current stored document is fetched and the partial
 *   merged over it before building the embedding text — computing the vector
 *   from the partial alone would describe only the changed fragment, not the
 *   document. When it doesn't, the embedding field is left out of the payload
 *   entirely so the stored vector survives the merge.
 */
async function resolveEmbeddings(
    prepared: PreparedOperation[],
    index: ResolvedIndex,
    vectorSourceFields: SearchIndexField[]
): Promise<{
    errors: DocumentWriteError[];
    stats: { generated: number; failed: number; skipped: number };
    warnings: string[];
}> {
    const errors: DocumentWriteError[] = [];
    const warnings: string[] = [];
    const vectorFieldNames = new Set(vectorSourceFields.map(f => f.fieldName));

    // Collect the operations that need a vector, together with the text to embed
    const pending: Array<{ operation: PreparedOperation; text: string }> = [];
    let skipped = 0;

    for (const operation of prepared) {
        if (operation.action === 'delete' || !operation.document) {
            continue;
        }

        const touchesVectorSource = Object.keys(operation.document)
            .some(fieldName => vectorFieldNames.has(fieldName));

        if (operation.action === 'merge' && !touchesVectorSource) {
            // Nothing that feeds the vector changed — leave the stored one alone
            skipped++;
            continue;
        }

        let embeddingSource = operation.document;

        if (operation.action === 'merge') {
            const existing = await index.provider.getDocumentById(
                index.name,
                operation.documentId
            );
            if (existing.found && existing.source) {
                embeddingSource = { ...existing.source, ...operation.document };
            } else {
                warnings.push(
                    `Document "${operation.documentId}" was not found when rebuilding its embedding; the vector was built from the merge payload alone.`
                );
            }
        }

        const text = getEmbeddingText(embeddingSource, vectorSourceFields);
        if (text.trim().length === 0) {
            skipped++;
            continue;
        }

        pending.push({ operation, text });
    }

    if (pending.length === 0) {
        return { errors, stats: { generated: 0, failed: 0, skipped }, warnings };
    }

    try {
        const result = await generateEmbeddings(pending.map(p => p.text), {
            providerId: index.embeddingConfig.providerId || undefined,
            modelId: index.embeddingConfig.modelId || undefined,
            dimensions: index.embeddingConfig.dimensions || undefined,
            feature: 'document_indexing',
        });

        result.embeddings.forEach((embedding, resultIndex) => {
            const target = pending[resultIndex]?.operation;
            if (target?.document) {
                target.document[EMBEDDING_FIELD_NAME] = embedding.vector;
            }
        });

        return {
            errors,
            stats: { generated: result.embeddings.length, failed: 0, skipped },
            warnings,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Embedding generation failed';
        logger.error('Embedding generation failed', { indexName: index.name, error: message });

        // Writing the document without a vector would leave it unreachable by
        // semantic search, so fail those operations instead.
        pending.forEach(({ operation }) => {
            errors.push({
                operationIndex: operation.operationIndex,
                documentId: operation.documentId,
                error: `Embedding failed: ${message}`,
                field: EMBEDDING_FIELD_NAME,
            });
        });

        return {
            errors,
            stats: { generated: 0, failed: pending.length, skipped },
            warnings,
        };
    }
}

/**
 * Apply a batch of incremental write operations to a search index.
 *
 * Operations are independent: a failure in one is reported against its own
 * position and does not prevent the others from being applied.
 */
export async function writeDocuments(
    searchIndexId: string,
    operations: DocumentWriteOperation[]
): Promise<DocumentWriteResult> {
    const startTime = Date.now();
    const errors: DocumentWriteError[] = [];
    const warnings: string[] = [];
    const counts: Record<DocumentWriteAction, number> = { upload: 0, merge: 0, delete: 0 };

    const index = await resolveIndex(searchIndexId);

    // 1. Transform payloads and resolve document ids
    const prepared: PreparedOperation[] = [];
    operations.forEach((operation, operationIndex) => {
        const { prepared: ok, errors: opErrors } = prepareOperation(operation, operationIndex, index);
        if (ok) {
            prepared.push(ok);
        }
        errors.push(...opErrors);
    });

    // 2. Embeddings for semantic/hybrid indexes
    let embeddingStats: DocumentWriteResult['embeddingStats'];

    if (index.embeddingConfig.enabled) {
        const vectorSourceFields = await fieldsRepository.getVectorSourceFields(searchIndexId);

        if (vectorSourceFields.length === 0) {
            warnings.push(
                'No vector source fields configured for embedding generation. Mark fields as "vector source" in field mappings.'
            );
            embeddingStats = { enabled: true, generated: 0, failed: 0, skipped: prepared.length };
        } else {
            const embeddingResult = await resolveEmbeddings(prepared, index, vectorSourceFields);
            errors.push(...embeddingResult.errors);
            warnings.push(...embeddingResult.warnings);
            embeddingStats = { enabled: true, ...embeddingResult.stats };
        }
    }

    // Drop operations whose embedding failed — they were rejected above
    const failedOperationIndices = new Set(errors.map(e => e.operationIndex));
    const writable = prepared.filter(op => !failedOperationIndices.has(op.operationIndex));

    // 3. Single bulk write, whatever the action mix
    let succeeded = 0;

    if (writable.length > 0) {
        const bulkOperations: BulkWriteOperation[] = writable.map(op => ({
            action: op.action,
            _id: op.documentId,
            document: op.document,
        }));

        const result = await index.provider.bulkWrite(index.name, bulkOperations, {
            refresh: elasticsearchConfig.indexing.refreshOnComplete ? 'wait_for' : false,
        });

        succeeded = result.indexed;
        counts.upload = result.counts.upload;
        counts.merge = result.counts.merge;
        counts.delete = result.counts.delete;

        // Provider errors are indexed against the bulk array — map back to the
        // caller's positions.
        result.errors.forEach(err => {
            const source = writable[err.index];
            errors.push({
                operationIndex: source?.operationIndex ?? err.index,
                documentId: err.id ?? source?.documentId,
                error: err.error,
            });
        });
    }

    // 4. Refresh index stats so documentCount reflects the change
    if (succeeded > 0) {
        const delta = counts.upload + counts.merge - counts.delete;
        await updateIndexStats(searchIndexId, delta);
    }

    const durationMs = Date.now() - startTime;
    const failed = operations.length - succeeded;

    logger.info('Incremental document write completed', {
        searchIndexId,
        indexName: index.name,
        total: operations.length,
        succeeded,
        failed,
        counts,
        embeddingsGenerated: embeddingStats?.generated ?? 0,
        durationMs,
    });

    return {
        success: failed === 0,
        total: operations.length,
        succeeded,
        failed,
        counts,
        embeddingStats,
        errors,
        warnings,
        durationMs,
    };
}

// ============================================================================
// DELETE BY FILTER
// ============================================================================

/**
 * Delete every document matching a set of filter clauses.
 *
 * Filters use the same syntax and the same builders as the search API, so a
 * filter can be tried in search first to see what it selects. With `dryRun` the
 * matched count is returned without deleting anything — the admin UI uses that
 * as a confirmation step before a destructive purge.
 */
export async function deleteDocumentsByFilter(
    searchIndexId: string,
    filters: FilterClause[],
    options?: { dryRun?: boolean; sampleSize?: number }
): Promise<DeleteByFilterOutcome> {
    const startTime = Date.now();
    const dryRun = options?.dryRun ?? false;

    const index = await resolveIndex(searchIndexId);

    // Field configuration comes from the same context search uses, so filter
    // validation (is this field filterable? what type is it?) matches search.
    const context = await resolveSearchContextUngated(searchIndexId);
    const filterExpression = index.provider.buildFilterExpression(filters, context);

    // Same column set as browse, so the preview a user confirms against looks like
    // the table they were just looking at — including the timestamp guard.
    const includeTimestamps = !index.requiresReindex;
    let columns = resolveDisplayColumns(index.fields, { includeTimestamps });

    const runDelete = (forColumns: DocumentColumn[]) =>
        index.provider.deleteByFilter(index.name, filterExpression, {
            refresh: elasticsearchConfig.indexing.refreshOnComplete,
            dryRun,
            // Only a dry run needs a sample; the real delete pays nothing for it.
            ...(dryRun
                ? {
                    sampleSize: options?.sampleSize ?? 0,
                    sampleFields: toProviderFields(forColumns, index.fields),
                }
                : {}),
        });

    let result = await runDelete(columns);

    // Retry without the optional columns on a rejected field selection, mirroring
    // listDocuments — but only for a dry run. A real delete is never re-run: it
    // may have deleted documents before failing, and sampleFields is not even
    // sent on that path, so the columns cannot be what broke it.
    if (!result.success && dryRun && includeTimestamps && isFieldSelectionError(result.error)) {
        const fallbackColumns = resolveDisplayColumns(index.fields, { includeTimestamps: false });

        if (!sameColumns(columns, fallbackColumns)) {
            logger.warn('Delete-by-filter preview failed on field selection; retrying without optional columns', {
                searchIndexId,
                indexName: index.name,
                error: result.error,
            });

            const retry = await runDelete(fallbackColumns);

            // Keep the original failure unless the retry actually succeeded, so the
            // error thrown below is the one describing the real cause.
            if (retry.success) {
                columns = fallbackColumns;
                result = retry;
            }
        }
    }

    if (!result.success) {
        throw new Error(result.error || 'Delete by filter failed');
    }

    if (result.deleted > 0) {
        await updateIndexStats(searchIndexId, -result.deleted);
    }

    logger.info('Delete by filter completed', {
        searchIndexId,
        indexName: index.name,
        matched: result.matched,
        deleted: result.deleted,
        sampled: result.sample?.length ?? 0,
        dryRun,
    });

    return {
        matched: result.matched,
        deleted: result.deleted,
        sample: result.sample ?? [],
        columns,
        dryRun,
        durationMs: Date.now() - startTime,
    };
}
