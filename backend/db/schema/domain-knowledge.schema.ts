// db/schema/domain-knowledge.schema.ts

/**
 * Domain Knowledge Schema
 *
 * Stores domain knowledge entries (FAQs, facts, extracts) for the knowledge action
 * in the deterministic chat pipeline.
 *
 * Key design decisions:
 * - Knowledge is a pool of facts tied to a Search Index
 * - Not directly linked to items in the index (products, articles, etc.)
 * - Used when user asks general domain questions that aren't search-worthy
 * - Synced to Elasticsearch for fuzzy matching
 * - Index-agnostic: works for any domain (fashion, electronics, wine, etc.)
 */

import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { searchIndex } from './search-index.schema';

// ============================================================================
// DOMAIN KNOWLEDGE TABLE
// ============================================================================

export const domainKnowledge = pgTable('domain_knowledge', {
  // ═══════════════════════════════════════════════════════════════════════════
  // IDENTITY
  // ═══════════════════════════════════════════════════════════════════════════
  id: uuid('id').primaryKey().defaultRandom(),

  // ═══════════════════════════════════════════════════════════════════════════
  // RELATIONSHIP - Tied to Search Index (not Experience)
  // ═══════════════════════════════════════════════════════════════════════════
  /**
   * Reference to the search index this knowledge belongs to.
   * Knowledge is shared across all experiences using this index.
   */
  searchIndexId: uuid('search_index_id')
    .notNull()
    .references(() => searchIndex.id, { onDelete: 'cascade' }),

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTENT (Admin-written facts)
  // ═══════════════════════════════════════════════════════════════════════════
  /**
   * The question or topic this entry addresses.
   * Used for search matching and display in admin UI.
   * Example: "What's the difference between cotton and wool?"
   */
  question: text('question').notNull(),

  /**
   * The factual answer/content.
   * This is what gets provided to AI for synthesis.
   * Example: "Cotton is a plant-based natural fiber that is lightweight..."
   */
  answer: text('answer').notNull(),

  /**
   * Optional tags for organization and search optimization.
   * Stored as comma-separated string, parsed for ES indexing.
   * Freeform - admin can use any tags relevant to their domain.
   * Example: "cotton,wool,fabric,materials,comparison"
   */
  tags: text('tags'),

  // ═══════════════════════════════════════════════════════════════════════════
  // METADATA
  // ═══════════════════════════════════════════════════════════════════════════
  /**
   * Priority for ranking when multiple entries match.
   * Higher priority entries are preferred.
   */
  priority: integer('priority').notNull().default(0),

  /**
   * Whether this entry is active and should be included in searches.
   */
  isActive: boolean('is_active').notNull().default(true),

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIT
  // ═══════════════════════════════════════════════════════════════════════════
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),

}, (table) => ({
  // Index for filtering by search index
  searchIndexIdx: index('domain_knowledge_search_index_idx').on(table.searchIndexId),
  // Index for filtering active entries
  isActiveIdx: index('domain_knowledge_is_active_idx').on(table.isActive),
  // Composite index for common query pattern
  searchIndexActiveIdx: index('domain_knowledge_search_index_active_idx')
    .on(table.searchIndexId, table.isActive),
}));

// ============================================================================
// RELATIONS
// ============================================================================

export const domainKnowledgeRelations = relations(domainKnowledge, ({ one }) => ({
  searchIndex: one(searchIndex, {
    fields: [domainKnowledge.searchIndexId],
    references: [searchIndex.id],
  }),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type DomainKnowledge = typeof domainKnowledge.$inferSelect;
export type NewDomainKnowledge = typeof domainKnowledge.$inferInsert;

/**
 * Knowledge entry with parsed tags (for service layer)
 */
export interface DomainKnowledgeEntry extends Omit<DomainKnowledge, 'tags'> {
  tags: string[];
}

/**
 * Input for creating a knowledge entry
 */
export interface CreateDomainKnowledgeInput {
  searchIndexId: string;
  question: string;
  answer: string;
  tags?: string[];
  priority?: number;
  createdBy?: string;
}

/**
 * Input for updating a knowledge entry
 */
export interface UpdateDomainKnowledgeInput {
  question?: string;
  answer?: string;
  tags?: string[];
  priority?: number;
  isActive?: boolean;
  updatedBy?: string;
}
