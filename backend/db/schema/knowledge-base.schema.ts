// db/schema/knowledge-base.schema.ts

/**
 * Knowledge Base Schema — Domain Knowledge Base (Sprint 6 / Phase E)
 *
 * Two-table design for file_store data sources:
 *
 * `knowledge_documents` — one row per uploaded document.
 *   Tracks lifecycle: upload → processing → ready/failed
 *
 * `knowledge_chunks` — one row per text chunk from a document.
 *   Stores the chunk content + pgvector embedding for semantic search.
 *   The tool executor queries this table when a file_store data source tool runs.
 *
 * Scoping: all queries are scoped to dataSourceId so that a single
 * file_store data source can hold many documents, and tools on that
 * data source only see their own documents.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  index,
  vector,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { dataSources } from './data-sources.schema';

// ============================================================================
// ENUMS
// ============================================================================

export const documentStatusEnum = pgEnum('knowledge_document_status', [
  'pending',     // Uploaded, not yet processed
  'processing',  // Being chunked and embedded
  'ready',       // All chunks embedded and searchable
  'failed',      // Processing failed
]);

// ============================================================================
// KNOWLEDGE DOCUMENTS TABLE
// ============================================================================

export const knowledgeDocuments = pgTable('knowledge_documents', {
  id: uuid('id').primaryKey().defaultRandom(),

  /** The file_store data source this document belongs to */
  dataSourceId: uuid('data_source_id')
    .notNull()
    .references(() => dataSources.id, { onDelete: 'cascade' }),

  /** Document display name (original filename or user-provided name) */
  name: varchar('name', { length: 500 }).notNull(),

  /** MIME type if known (text/plain, application/pdf, text/markdown, etc.) */
  mimeType: varchar('mime_type', { length: 100 }),

  /** Original file size in bytes */
  sizeBytes: integer('size_bytes'),

  /** Processing lifecycle status */
  status: documentStatusEnum('status').notNull().default('pending'),

  /** Number of chunks created (populated after processing completes) */
  chunkCount: integer('chunk_count').notNull().default(0),

  /** Error message if status is 'failed' */
  errorMessage: text('error_message'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }),

}, (table) => ({
  // Primary lookup: all documents for a data source
  dataSourceIdx: index('knowledge_documents_data_source_idx').on(table.dataSourceId),
  // Status filtering
  dataSourceStatusIdx: index('knowledge_documents_data_source_status_idx').on(table.dataSourceId, table.status),
}));

// ============================================================================
// KNOWLEDGE CHUNKS TABLE
// ============================================================================

export const knowledgeChunks = pgTable('knowledge_chunks', {
  id: uuid('id').primaryKey().defaultRandom(),

  /** The document this chunk came from */
  documentId: uuid('document_id')
    .notNull()
    .references(() => knowledgeDocuments.id, { onDelete: 'cascade' }),

  /**
   * Denormalized dataSourceId for fast scoped vector search without a join.
   * Always matches knowledgeDocuments.dataSourceId for this chunk.
   */
  dataSourceId: uuid('data_source_id')
    .notNull()
    .references(() => dataSources.id, { onDelete: 'cascade' }),

  /** Sequential chunk index within the document (0-based) */
  chunkIndex: integer('chunk_index').notNull(),

  /** The text content of this chunk */
  content: text('content').notNull(),

  /**
   * pgvector embedding of the chunk content.
   * NULL only if embedding failed (chunk is still returned by keyword fallback).
   * Dimension 1536 — matches the rest of the embedding layer.
   */
  embedding: vector('embedding', { dimensions: 1536 }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),

}, (table) => ({
  // For all chunks of a document (deletion, listing)
  documentIdx: index('knowledge_chunks_document_idx').on(table.documentId),
  // For data source scoped lookup (used by tool executor)
  dataSourceIdx: index('knowledge_chunks_data_source_idx').on(table.dataSourceId),
  // Ordered chunks within a document
  documentChunkIdx: index('knowledge_chunks_document_chunk_idx').on(table.documentId, table.chunkIndex),
  // pgvector HNSW index — scoped vector search uses this
  embeddingIdx: index('knowledge_chunks_embedding_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),
}));

// ============================================================================
// RELATIONS
// ============================================================================

export const knowledgeDocumentsRelations = relations(knowledgeDocuments, ({ one, many }) => ({
  dataSource: one(dataSources, {
    fields: [knowledgeDocuments.dataSourceId],
    references: [dataSources.id],
  }),
  chunks: many(knowledgeChunks),
}));

export const knowledgeChunksRelations = relations(knowledgeChunks, ({ one }) => ({
  document: one(knowledgeDocuments, {
    fields: [knowledgeChunks.documentId],
    references: [knowledgeDocuments.id],
  }),
  dataSource: one(dataSources, {
    fields: [knowledgeChunks.dataSourceId],
    references: [dataSources.id],
  }),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type KnowledgeDocument = typeof knowledgeDocuments.$inferSelect;
export type NewKnowledgeDocument = typeof knowledgeDocuments.$inferInsert;

export type KnowledgeChunk = typeof knowledgeChunks.$inferSelect;
export type NewKnowledgeChunk = typeof knowledgeChunks.$inferInsert;
