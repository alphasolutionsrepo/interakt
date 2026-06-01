// src/features/search/providers/elasticsearch/elasticsearch.client.ts

/**
 * Elasticsearch Client
 * Singleton wrapper around the official @elastic/elasticsearch client
 */

import 'server-only';

import { Client, type ClientOptions } from '@elastic/elasticsearch';
import { elasticsearchConfig } from '@/config';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('elasticsearch-client');

// ============================================================================
// SINGLETON CLIENT
// ============================================================================

let client: Client | null = null;

/**
 * Get or create the Elasticsearch client instance
 */
export function getElasticsearchClient(): Client {
    if (client) {
        return client;
    }

    const config = elasticsearchConfig;

    // Build client options
    const clientOptions: ClientOptions = {
        node: config.url,
        requestTimeout: config.request.timeout,
        maxRetries: config.request.maxRetries,
    };

    // Add authentication
    if (config.auth.apiKey) {
        clientOptions.auth = {
            apiKey: config.auth.apiKey,
        };
    } else if (config.auth.username && config.auth.password) {
        clientOptions.auth = {
            username: config.auth.username,
            password: config.auth.password,
        };
    }

    // Configure TLS
    if (config.tls.enabled) {
        clientOptions.tls = {
            rejectUnauthorized: config.tls.rejectUnauthorized,
        };
    }

    // Create client
    client = new Client(clientOptions);

    logger.info('Elasticsearch client initialized', {
        node: config.url,
        hasAuth: !!(config.auth.apiKey || config.auth.username),
        tlsEnabled: config.tls.enabled,
    });

    return client;
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

export interface ESHealthStatus {
    connected: boolean;
    clusterName?: string;
    clusterStatus?: 'green' | 'yellow' | 'red';
    numberOfNodes?: number;
    version?: string;
    error?: string;
}

/**
 * Check Elasticsearch cluster health
 */
export async function checkHealth(): Promise<ESHealthStatus> {
    try {
        const es = getElasticsearchClient();

        // Get cluster info
        const info = await es.info();
        const health = await es.cluster.health();

        return {
            connected: true,
            clusterName: health.cluster_name,
            clusterStatus: health.status.toLowerCase() as 'green' | 'yellow' | 'red',
            numberOfNodes: health.number_of_nodes,
            version: info.version.number,
        };
    } catch (error) {
        logger.error('Elasticsearch health check failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        return {
            connected: false,
            error: error instanceof Error ? error.message : 'Connection failed',
        };
    }
}

// ============================================================================
// INDEX OPERATIONS
// ============================================================================

export interface CreateIndexOptions {
    numberOfShards?: number;
    numberOfReplicas?: number;
    refreshInterval?: string;
    mappings?: Record<string, unknown>;
    settings?: Record<string, unknown>;
}

/**
 * Check if an index exists
 */
export async function indexExists(indexName: string): Promise<boolean> {
    const es = getElasticsearchClient();
    return await es.indices.exists({ index: indexName });
}

/**
 * Create an index with optional settings and mappings
 */
export async function createIndex(
    indexName: string,
    options: CreateIndexOptions = {}
): Promise<{ success: boolean; error?: string }> {
    try {
        const es = getElasticsearchClient();

        // Check if index already exists
        const exists = await indexExists(indexName);
        if (exists) {
            logger.warn('Index already exists', { indexName });
            return { success: true }; // Consider existing as success
        }

        // Build index settings
        const settings: Record<string, unknown> = {
            number_of_shards: options.numberOfShards ?? 1,
            number_of_replicas: options.numberOfReplicas ?? 0,
            refresh_interval: options.refreshInterval ?? '1s',
            ...options.settings,
        };

        await es.indices.create({
            index: indexName,
            settings,
            mappings: options.mappings,
        });

        logger.info('Index created', { indexName });
        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create index';
        logger.error('Failed to create index', { indexName, error: message });
        return { success: false, error: message };
    }
}

/**
 * Delete an index
 */
export async function deleteIndex(indexName: string): Promise<{ success: boolean; error?: string }> {
    try {
        const es = getElasticsearchClient();

        const exists = await indexExists(indexName);
        if (!exists) {
            return { success: true }; // Already doesn't exist
        }

        await es.indices.delete({ index: indexName });
        logger.info('Index deleted', { indexName });
        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete index';
        logger.error('Failed to delete index', { indexName, error: message });
        return { success: false, error: message };
    }
}

/**
 * Get index mapping
 * Returns the mapping configuration for an index including field types and dense_vector dimensions
 */
export async function getIndexMapping(indexName: string): Promise<{
    success: boolean;
    mapping?: Record<string, unknown>;
    embeddingDimensions?: number;
    error?: string;
}> {
    try {
        const es = getElasticsearchClient();

        const exists = await indexExists(indexName);
        if (!exists) {
            return { success: false, error: `Index "${indexName}" does not exist` };
        }

        const response = await es.indices.getMapping({ index: indexName });
        const indexMapping = response[indexName];

        if (!indexMapping) {
            return { success: false, error: 'No mapping found' };
        }

        // Extract embedding dimensions if present
        const properties = indexMapping.mappings?.properties as Record<string, unknown> | undefined;
        const embeddingField = properties?.['content_embedding'] as { dims?: number } | undefined;
        const embeddingDimensions = embeddingField?.dims;

        return {
            success: true,
            mapping: indexMapping.mappings as Record<string, unknown>,
            embeddingDimensions,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get index mapping';
        logger.error('Failed to get index mapping', { indexName, error: message });
        return { success: false, error: message };
    }
}

/**
 * Get index statistics
 */
export async function getIndexStats(indexName: string): Promise<{
    documentCount: number;
    sizeInBytes: number;
    health: 'green' | 'yellow' | 'red' | 'unknown';
} | null> {
    try {
        const es = getElasticsearchClient();

        const exists = await indexExists(indexName);
        if (!exists) {
            return null;
        }

        const [stats, health] = await Promise.all([
            es.indices.stats({ index: indexName }),
            es.cluster.health({ index: indexName }),
        ]);

        const indexStats = stats.indices?.[indexName];
        if (!indexStats) {
            return null;
        }

        return {
            documentCount: indexStats.primaries?.docs?.count ?? 0,
            sizeInBytes: indexStats.primaries?.store?.size_in_bytes ?? 0,
            health: (health.status?.toLowerCase() ?? 'unknown') as 'green' | 'yellow' | 'red' | 'unknown',
        };
    } catch (error) {
        logger.error('Failed to get index stats', {
            indexName,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return null;
    }
}

// ============================================================================
// BULK OPERATIONS
// ============================================================================

export interface BulkIndexDocument {
    _id?: string;
    [key: string]: unknown;
}

export interface BulkIndexResult {
    success: boolean;
    indexed: number;
    failed: number;
    errors: Array<{
        index: number;
        id?: string;
        error: string;
    }>;
    took: number;
}

/**
 * Bulk index documents
 * Handles batching internally based on config
 */
export async function bulkIndex(
    indexName: string,
    documents: BulkIndexDocument[],
    options?: {
        refresh?: boolean | 'wait_for';
    }
): Promise<BulkIndexResult> {
    const es = getElasticsearchClient();
    const batchSize = elasticsearchConfig.indexing.batchSize;

    let totalIndexed = 0;
    let totalFailed = 0;
    const allErrors: BulkIndexResult['errors'] = [];
    const startTime = Date.now();

    // Process in batches
    for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize);

        // Build bulk operations
        const operations = batch.flatMap((doc, batchIndex) => {
            const { _id, ...body } = doc;
            const indexOp: Record<string, unknown> = { _index: indexName };
            if (_id) {
                indexOp._id = _id;
            }
            return [{ index: indexOp }, body];
        });

        try {
            const response = await es.bulk({
                operations,
                refresh: options?.refresh,
            });

            // Process results
            if (response.items) {
                response.items.forEach((item, batchIndex) => {
                    const indexResult = item.index;
                    if (indexResult?.error) {
                        totalFailed++;
                        allErrors.push({
                            index: i + batchIndex,
                            id: indexResult._id,
                            error: typeof indexResult.error === 'string'
                                ? indexResult.error
                                : indexResult.error.reason || 'Unknown error',
                        });
                    } else {
                        totalIndexed++;
                    }
                });
            }
        } catch (error) {
            // Entire batch failed
            logger.error('Bulk index batch failed', {
                indexName,
                batchStart: i,
                batchSize: batch.length,
                error: error instanceof Error ? error.message : 'Unknown error',
            });

            totalFailed += batch.length;
            batch.forEach((_, batchIndex) => {
                allErrors.push({
                    index: i + batchIndex,
                    error: error instanceof Error ? error.message : 'Batch failed',
                });
            });
        }
    }

    const took = Date.now() - startTime;

    logger.info('Bulk index completed', {
        indexName,
        total: documents.length,
        indexed: totalIndexed,
        failed: totalFailed,
        took,
    });

    return {
        success: totalFailed === 0,
        indexed: totalIndexed,
        failed: totalFailed,
        errors: allErrors,
        took,
    };
}

// ============================================================================
// SCROLL / FETCH ALL DOCUMENTS
// ============================================================================

export interface ScrollDocument {
    _id: string;
    _source: Record<string, unknown>;
}

/**
 * Fetch all documents from an index using scroll API
 * Used for reindexing operations
 */
export async function fetchAllDocuments(
    indexName: string,
    options?: {
        batchSize?: number;
        scrollTimeout?: string;
    }
): Promise<{ success: boolean; documents: ScrollDocument[]; error?: string }> {
    try {
        const es = getElasticsearchClient();
        const batchSize = options?.batchSize ?? 1000;
        const scrollTimeout = options?.scrollTimeout ?? '2m';

        const exists = await indexExists(indexName);
        if (!exists) {
            return { success: false, documents: [], error: `Index "${indexName}" does not exist` };
        }

        const allDocuments: ScrollDocument[] = [];

        // Initial search with scroll
        let response = await es.search({
            index: indexName,
            scroll: scrollTimeout,
            size: batchSize,
            query: { match_all: {} },
            _source: true,
        });

        // Collect first batch
        for (const hit of response.hits.hits) {
            allDocuments.push({
                _id: hit._id,
                _source: hit._source as Record<string, unknown>,
            });
        }

        // Continue scrolling until no more results
        while (response.hits.hits.length > 0) {
            const scrollId = response._scroll_id;
            if (!scrollId) break;

            response = await es.scroll({
                scroll_id: scrollId,
                scroll: scrollTimeout,
            });

            for (const hit of response.hits.hits) {
                allDocuments.push({
                    _id: hit._id,
                    _source: hit._source as Record<string, unknown>,
                });
            }
        }

        // Clear scroll context
        if (response._scroll_id) {
            await es.clearScroll({ scroll_id: response._scroll_id }).catch(() => {
                // Ignore errors when clearing scroll
            });
        }

        logger.info('Fetched all documents from index', {
            indexName,
            documentCount: allDocuments.length,
        });

        return { success: true, documents: allDocuments };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to fetch documents';
        logger.error('Failed to fetch all documents', { indexName, error: message });
        return { success: false, documents: [], error: message };
    }
}

// ============================================================================
// GET DOCUMENT BY ID
// ============================================================================

export interface GetDocumentResult {
    found: boolean;
    id?: string;
    source?: Record<string, unknown>;
    error?: string;
}

/**
 * Get a single document by ID
 */
export async function getDocumentById(
    indexName: string,
    documentId: string
): Promise<GetDocumentResult> {
    try {
        const es = getElasticsearchClient();

        const exists = await indexExists(indexName);
        if (!exists) {
            return { found: false, error: `Index "${indexName}" does not exist` };
        }

        const response = await es.get({
            index: indexName,
            id: documentId,
        });

        if (!response.found) {
            return { found: false };
        }

        return {
            found: true,
            id: response._id,
            source: response._source as Record<string, unknown>,
        };
    } catch (error) {
        // Handle 404 - document not found
        if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
            return { found: false };
        }

        const message = error instanceof Error ? error.message : 'Failed to get document';
        logger.error('Failed to get document by ID', { indexName, documentId, error: message });
        return { found: false, error: message };
    }
}

// ============================================================================
// REFRESH
// ============================================================================

/**
 * Refresh an index to make recent changes searchable
 */
export async function refreshIndex(indexName: string): Promise<boolean> {
    try {
        const es = getElasticsearchClient();
        await es.indices.refresh({ index: indexName });
        return true;
    } catch (error) {
        logger.error('Failed to refresh index', {
            indexName,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return false;
    }
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Close the client connection (for graceful shutdown)
 */
export async function closeClient(): Promise<void> {
    if (client) {
        await client.close();
        client = null;
        logger.info('Elasticsearch client closed');
    }
}
