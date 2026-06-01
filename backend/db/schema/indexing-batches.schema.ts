// db/schema/indexing-batches.schema.ts

/**
 * Indexing Batches Schema
 * Tracks document upload and indexing operations for search indexes
 */

import {
    pgTable,
    uuid,
    varchar,
    text,
    timestamp,
    integer,
    json,
    index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { searchIndex } from './search-index.schema';

// ============================================================================
// BATCH STATUS ENUM
// ============================================================================

export const INDEXING_BATCH_STATUSES = [
    'pending',      // Batch created, not yet started
    'processing',   // Currently indexing documents
    'completed',    // All documents processed (may have some failures)
    'failed',       // Critical error, batch could not complete
    'cancelled',    // User cancelled the operation
] as const;

export type IndexingBatchStatus = typeof INDEXING_BATCH_STATUSES[number];

// ============================================================================
// INDEXING BATCHES TABLE
// ============================================================================

/**
 * Tracks individual indexing operations (uploads)
 * Each batch represents a single upload/indexing job
 */
export const indexingBatches = pgTable('indexing_batches', {
    // ============================================================================
    // IDENTITY
    // ============================================================================
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * The search index this batch belongs to
     */
    searchIndexId: uuid('search_index_id')
        .notNull()
        .references(() => searchIndex.id, { onDelete: 'cascade' }),

    // ============================================================================
    // STATUS TRACKING
    // ============================================================================
    status: varchar('status', { length: 20 }).notNull().default('pending'),

    /**
     * Total documents in this batch
     */
    totalDocuments: integer('total_documents').notNull().default(0),

    /**
     * Documents successfully processed (transformed)
     */
    processedDocuments: integer('processed_documents').notNull().default(0),

    /**
     * Documents successfully indexed to ES
     */
    indexedDocuments: integer('indexed_documents').notNull().default(0),

    /**
     * Documents that failed to index
     */
    failedDocuments: integer('failed_documents').notNull().default(0),

    // ============================================================================
    // ERROR TRACKING
    // ============================================================================
    /**
     * Array of error details for failed documents
     * { documentIndex: number, documentId?: string, error: string, field?: string }
     */
    errors: json('errors').$type<Array<{
        documentIndex: number;
        documentId?: string;
        error: string;
        field?: string;
    }>>().default([]),

    /**
     * Fatal error message if batch failed entirely
     */
    errorMessage: text('error_message'),

    // ============================================================================
    // METADATA
    // ============================================================================
    /**
     * Original filename if uploaded from file
     */
    sourceFileName: varchar('source_file_name', { length: 255 }),

    /**
     * Size of uploaded data in bytes
     */
    sourceSizeBytes: integer('source_size_bytes'),

    // ============================================================================
    // TIMING
    // ============================================================================
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),

    /**
     * Processing duration in milliseconds
     */
    durationMs: integer('duration_ms'),

    // ============================================================================
    // AUDIT
    // ============================================================================
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),

}, (table) => ({
    searchIndexIdIdx: index('indexing_batches_search_index_id_idx').on(table.searchIndexId),
    statusIdx: index('indexing_batches_status_idx').on(table.status),
    createdAtIdx: index('indexing_batches_created_at_idx').on(table.createdAt),
}));

// ============================================================================
// RELATIONS
// ============================================================================

export const indexingBatchesRelations = relations(indexingBatches, ({ one }) => ({
    searchIndex: one(searchIndex, {
        fields: [indexingBatches.searchIndexId],
        references: [searchIndex.id],
    }),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type IndexingBatch = typeof indexingBatches.$inferSelect;
export type NewIndexingBatch = typeof indexingBatches.$inferInsert;
