// src/features/ai-service/utils/batch-processor.ts

/**
 * Batch Processor
 * 
 * Handles processing large batches of items (like embeddings)
 * in smaller chunks to avoid timeouts and memory issues.
 */

import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('ai-service-batch');

// ============================================================================
// TYPES
// ============================================================================

export interface BatchProcessorOptions<T, R> {
    /** Items to process */
    items: T[];
    /** Batch size (number of items per batch) */
    batchSize: number;
    /** Function to process each batch */
    processor: (batch: T[], batchIndex: number) => Promise<R[]>;
    /** Optional callback for progress updates */
    onProgress?: (progress: BatchProgress) => void;
    /** Delay between batches in ms (optional, for rate limiting) */
    delayBetweenBatches?: number;
    /** Continue processing on error (default: false) */
    continueOnError?: boolean;
}

export interface BatchProgress {
    /** Current batch being processed (1-indexed) */
    currentBatch: number;
    /** Total number of batches */
    totalBatches: number;
    /** Items processed so far */
    itemsProcessed: number;
    /** Total items to process */
    totalItems: number;
    /** Percentage complete (0-100) */
    percentComplete: number;
}

export interface BatchResult<R> {
    /** All results in order */
    results: R[];
    /** Total items processed */
    totalProcessed: number;
    /** Number of successful items */
    successCount: number;
    /** Number of failed items */
    failedCount: number;
    /** Errors encountered (if continueOnError is true) */
    errors: Array<{
        batchIndex: number;
        error: Error;
    }>;
    /** Total processing time in ms */
    durationMs: number;
}

// ============================================================================
// BATCH PROCESSOR
// ============================================================================

/**
 * Process items in batches
 * 
 * @example
 * const results = await processBatches({
 *   items: textsToEmbed,
 *   batchSize: 100,
 *   processor: async (batch) => {
 *     return await adapter.generateEmbeddings({ texts: batch }, config);
 *   },
 *   onProgress: (progress) => {
 *     console.log(`${progress.percentComplete}% complete`);
 *   },
 * });
 */
export async function processBatches<T, R>(
    options: BatchProcessorOptions<T, R>
): Promise<BatchResult<R>> {
    const {
        items,
        batchSize,
        processor,
        onProgress,
        delayBetweenBatches = 0,
        continueOnError = false,
    } = options;

    const startTime = Date.now();
    const results: R[] = [];
    const errors: Array<{ batchIndex: number; error: Error }> = [];

    // Calculate total batches
    const totalBatches = Math.ceil(items.length / batchSize);

    logger.debug('Starting batch processing', {
        totalItems: items.length,
        batchSize,
        totalBatches,
    });

    // Process each batch
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const start = batchIndex * batchSize;
        const end = Math.min(start + batchSize, items.length);
        const batch = items.slice(start, end);

        try {
            // Process batch
            const batchResults = await processor(batch, batchIndex);
            results.push(...batchResults);

            // Report progress
            const progress: BatchProgress = {
                currentBatch: batchIndex + 1,
                totalBatches,
                itemsProcessed: end,
                totalItems: items.length,
                percentComplete: Math.round((end / items.length) * 100),
            };

            if (onProgress) {
                onProgress(progress);
            }

            logger.debug('Batch completed', {
                batch: batchIndex + 1,
                totalBatches,
                itemsInBatch: batch.length,
            });
        } catch (error) {
            const err = error as Error;
            logger.error('Batch processing error', err, {
                batchIndex,
                itemsInBatch: batch.length,
            });

            if (continueOnError) {
                errors.push({ batchIndex, error: err });
                // Add placeholder results for failed batch
                results.push(...new Array(batch.length).fill(null as unknown as R));
            } else {
                throw error;
            }
        }

        // Delay between batches (for rate limiting)
        if (delayBetweenBatches > 0 && batchIndex < totalBatches - 1) {
            await sleep(delayBetweenBatches);
        }
    }

    const durationMs = Date.now() - startTime;

    logger.info('Batch processing complete', {
        totalItems: items.length,
        successCount: items.length - errors.reduce((acc, e) => acc + 1, 0),
        failedCount: errors.length,
        durationMs,
    });

    return {
        results,
        totalProcessed: items.length,
        successCount: items.length - errors.length * (items.length / totalBatches),
        failedCount: errors.length > 0 ? Math.round(errors.length * (items.length / totalBatches)) : 0,
        errors,
        durationMs,
    };
}

// ============================================================================
// EMBEDDING-SPECIFIC BATCH PROCESSOR
// ============================================================================

export interface EmbeddingBatchOptions {
    /** Texts to embed */
    texts: string[];
    /** Batch size (default: 100) */
    batchSize?: number;
    /** Function to generate embeddings for a batch */
    embeddingFn: (texts: string[]) => Promise<number[][]>;
    /** Progress callback */
    onProgress?: (progress: BatchProgress) => void;
    /** Delay between batches for rate limiting */
    delayBetweenBatches?: number;
}

export interface EmbeddingBatchResult {
    /** All embeddings in order */
    embeddings: number[][];
    /** Total texts processed */
    totalProcessed: number;
    /** Processing time in ms */
    durationMs: number;
}

/**
 * Process embeddings in batches
 * 
 * Convenience wrapper around processBatches for embedding generation.
 * Handles the common case of splitting text arrays into batches.
 * 
 * @example
 * const result = await processEmbeddingBatches({
 *   texts: documentsToEmbed,
 *   batchSize: 100,
 *   embeddingFn: async (batch) => {
 *     const response = await aiService.generateEmbeddings(batch, options);
 *     return response.embeddings.map(e => e.vector);
 *   },
 * });
 */
export async function processEmbeddingBatches(
    options: EmbeddingBatchOptions
): Promise<EmbeddingBatchResult> {
    const {
        texts,
        batchSize = 100,
        embeddingFn,
        onProgress,
        delayBetweenBatches = 0,
    } = options;

    const result = await processBatches({
        items: texts,
        batchSize,
        processor: async (batch) => {
            const embeddings = await embeddingFn(batch);
            return embeddings;
        },
        onProgress,
        delayBetweenBatches,
        continueOnError: false, // Fail fast for embeddings
    });

    return {
        embeddings: result.results,
        totalProcessed: result.totalProcessed,
        durationMs: result.durationMs,
    };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Estimate optimal batch size based on text lengths
 * 
 * Useful when texts vary significantly in length and you want
 * to avoid hitting token limits.
 * 
 * @param texts - Array of texts
 * @param targetTokensPerBatch - Target tokens per batch (e.g., 8000)
 * @param avgCharsPerToken - Average characters per token (default: 4)
 * @returns Recommended batch size
 */
export function estimateOptimalBatchSize(
    texts: string[],
    targetTokensPerBatch: number = 8000,
    avgCharsPerToken: number = 4
): number {
    if (texts.length === 0) return 100;

    // Calculate average text length
    const totalChars = texts.reduce((acc, text) => acc + text.length, 0);
    const avgChars = totalChars / texts.length;

    // Estimate tokens per text
    const avgTokensPerText = avgChars / avgCharsPerToken;

    // Calculate batch size to hit target
    const optimalSize = Math.floor(targetTokensPerBatch / avgTokensPerText);

    // Clamp to reasonable range
    return Math.max(1, Math.min(optimalSize, 500));
}