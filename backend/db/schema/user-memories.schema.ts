// db/schema/user-memories.schema.ts

/**
 * User Memories Schema — Episodic Memory (Sprint 5 / Phase D)
 *
 * Cross-session, per-user memory scoped to an AI Experience.
 *
 * Tier 3 (cold) in the memory hierarchy:
 *   Tier 1: ai_sessions hot row (summary, facts, pipelineState)
 *   Tier 2: ai_session_messages (in-session semantic search)
 *   Tier 3: user_memories (cross-session stable facts ← THIS TABLE)
 *
 * Lifecycle:
 *   1. Post-session extraction pass — LLM reads the conversation and extracts
 *      stable, reusable facts (e.g., "prefers Nike shoes", "budget under $200").
 *   2. Each fact is embedded (1536-dim) and stored here.
 *   3. At turn start, the pipeline embeds the user message, retrieves top-K
 *      relevant memories via cosine similarity, and injects them into context.
 *   4. Users can view and delete their memories via the admin UI.
 *
 * Scoping:
 *   - userId is an opaque external string (set in session.userContext.userId).
 *   - Memories are scoped per (userId, aiExperienceId) — different experiences
 *     maintain independent memory spaces.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  real,
  integer,
  timestamp,
  index,
  vector,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { aiExperiences } from './ai-experience.schema';
import { aiSessions } from './ai-sessions.schema';

// ============================================================================
// USER MEMORIES TABLE
// ============================================================================

export const userMemories = pgTable('user_memories', {
  id: uuid('id').primaryKey().defaultRandom(),

  /**
   * External user identifier — opaque string from session.userContext.userId.
   * Not a FK because user identity is managed externally (auth system).
   */
  userId: varchar('user_id', { length: 255 }).notNull(),

  /** The AI Experience this memory belongs to */
  aiExperienceId: uuid('ai_experience_id')
    .notNull()
    .references(() => aiExperiences.id, { onDelete: 'cascade' }),

  /**
   * The extracted memory fact — a single, self-contained statement.
   * Examples:
   *   "User prefers Nike running shoes over Adidas"
   *   "User has a budget of around $150–$200 for footwear"
   *   "User is shopping for a gift for their partner"
   */
  content: text('content').notNull(),

  /**
   * Embedding vector for semantic retrieval (pgvector).
   * Generated at extraction time. NULL only if embedding fails.
   * Dimension 1536 — matches the rest of the embedding layer.
   */
  embedding: vector('embedding', { dimensions: 1536 }),

  /**
   * Extraction confidence (0.0–1.0).
   * LLM assigns this during extraction. Lower = more speculative fact.
   */
  confidence: real('confidence').notNull().default(1.0),

  /**
   * Session that produced this memory.
   * Nullable: if the source session is later deleted, we keep the memory.
   */
  sourceSessionId: uuid('source_session_id')
    .references(() => aiSessions.id, { onDelete: 'set null' }),

  /**
   * How many turns this memory has been retrieved and injected into context.
   * Used to surface the most "active" memories in the admin UI.
   */
  retrievalCount: integer('retrieval_count').notNull().default(0),

  /** When this memory was first extracted */
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),

  /** Last time this memory was retrieved during a turn */
  lastRetrievedAt: timestamp('last_retrieved_at', { withTimezone: true }),

}, (table) => ({
  // Primary lookup: all memories for a user within an experience
  userExperienceIdx: index('user_memories_user_experience_idx').on(table.userId, table.aiExperienceId),

  // For cleanup / admin: all memories from a specific session
  sourceSessionIdx: index('user_memories_source_session_idx').on(table.sourceSessionId),

  // pgvector HNSW index for cosine similarity retrieval
  embeddingIdx: index('user_memories_embedding_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),
}));

// ============================================================================
// RELATIONS
// ============================================================================

export const userMemoriesRelations = relations(userMemories, ({ one }) => ({
  aiExperience: one(aiExperiences, {
    fields: [userMemories.aiExperienceId],
    references: [aiExperiences.id],
  }),
  sourceSession: one(aiSessions, {
    fields: [userMemories.sourceSessionId],
    references: [aiSessions.id],
  }),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type UserMemory = typeof userMemories.$inferSelect;
export type NewUserMemory = typeof userMemories.$inferInsert;
