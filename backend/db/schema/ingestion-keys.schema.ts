// db/schema/ingestion-keys.schema.ts

/**
 * Ingestion Keys Schema
 *
 * Server-to-server credentials for writing to and deleting from search indexes.
 *
 * These are a DIFFERENT credential class from search experience access tokens.
 * An access token is deliberately public — it is baked into the embed snippet,
 * shipped in the widget bundle, and readable from any customer's page source, so
 * it can only ever authorize read-only operations. An ingestion key is a secret:
 * it is stored hashed, shown once at creation, scoped to specific indexes and
 * operations, and revocable. Never put one in a browser.
 */

import {
    pgTable,
    uuid,
    varchar,
    timestamp,
    json,
    index,
    unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { searchIndex } from './search-index.schema';

// ============================================================================
// OPERATIONS
// ============================================================================

/**
 * Operations an ingestion key can be granted.
 *
 * Reads are implied by being scoped to an index at all — these are the two
 * mutating capabilities, kept separate so a sink that only ever pushes documents
 * cannot also purge them.
 */
export const INGESTION_OPERATIONS = ['write', 'delete'] as const;

export type IngestionOperation = typeof INGESTION_OPERATIONS[number];

// ============================================================================
// INGESTION KEYS TABLE
// ============================================================================

export const ingestionKeys = pgTable('ingestion_keys', {
    // ========================================================================
    // IDENTITY
    // ========================================================================
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * Human label, e.g. "Storyblok sink (EN)". Shown in the admin list so a key
     * can be recognised without revealing it.
     */
    name: varchar('name', { length: 255 }).notNull(),

    // ========================================================================
    // CREDENTIAL
    // ========================================================================

    /**
     * Public half of the key.
     *
     * A hashed credential cannot be looked up by its hash, so the key is issued
     * as `ik_<prefix>_<secret>`: this column finds the row, then the secret is
     * verified against keyHash. Safe to display.
     */
    keyPrefix: varchar('key_prefix', { length: 32 }).notNull().unique(),

    /**
     * SHA-256 (hex) of the secret half. The secret itself is never stored, so a
     * lost key cannot be recovered — only replaced.
     *
     * SHA-256 rather than bcrypt deliberately: the secret is 256 bits of CSPRNG
     * output, so there is nothing for a slow KDF to protect against, and bcrypt
     * would add ~250ms to every ingestion request.
     */
    keyHash: varchar('key_hash', { length: 64 }).notNull(),

    // ========================================================================
    // SCOPE
    // ========================================================================

    /**
     * Granted operations, from INGESTION_OPERATIONS.
     * Index scope lives in the ingestion_key_indexes join table.
     */
    operations: json('operations').$type<IngestionOperation[]>().notNull().default([]),

    // ========================================================================
    // LIFECYCLE
    // ========================================================================

    /** Set when the key is revoked. A revoked key is kept for the audit trail. */
    revokedAt: timestamp('revoked_at'),

    /** Optional expiry. Null means the key does not expire on its own. */
    expiresAt: timestamp('expires_at'),

    /** Updated on each successful authentication, so unused keys can be spotted. */
    lastUsedAt: timestamp('last_used_at'),

    // ========================================================================
    // AUDIT
    // ========================================================================
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),

}, (table) => ({
    // Every authentication starts with a prefix lookup
    keyPrefixIdx: index('ingestion_keys_key_prefix_idx').on(table.keyPrefix),
    revokedAtIdx: index('ingestion_keys_revoked_at_idx').on(table.revokedAt),
}));

// ============================================================================
// INDEX SCOPE JOIN TABLE
// ============================================================================

/**
 * Which indexes a key may act on.
 *
 * A join table rather than an array column so that deleting a search index
 * cascades its grants away, instead of leaving a key scoped to an index that no
 * longer exists.
 */
export const ingestionKeyIndexes = pgTable('ingestion_key_indexes', {
    id: uuid('id').primaryKey().defaultRandom(),

    ingestionKeyId: uuid('ingestion_key_id')
        .notNull()
        .references(() => ingestionKeys.id, { onDelete: 'cascade' }),

    searchIndexId: uuid('search_index_id')
        .notNull()
        .references(() => searchIndex.id, { onDelete: 'cascade' }),

    createdAt: timestamp('created_at').notNull().defaultNow(),

}, (table) => ({
    ingestionKeyIdIdx: index('ingestion_key_indexes_key_id_idx').on(table.ingestionKeyId),
    searchIndexIdIdx: index('ingestion_key_indexes_search_index_id_idx').on(table.searchIndexId),
    // One grant per (key, index)
    uniqueGrant: unique('unique_ingestion_key_index').on(
        table.ingestionKeyId,
        table.searchIndexId
    ),
}));

// ============================================================================
// RELATIONS
// ============================================================================

export const ingestionKeysRelations = relations(ingestionKeys, ({ many }) => ({
    indexes: many(ingestionKeyIndexes),
}));

export const ingestionKeyIndexesRelations = relations(ingestionKeyIndexes, ({ one }) => ({
    ingestionKey: one(ingestionKeys, {
        fields: [ingestionKeyIndexes.ingestionKeyId],
        references: [ingestionKeys.id],
    }),
    searchIndex: one(searchIndex, {
        fields: [ingestionKeyIndexes.searchIndexId],
        references: [searchIndex.id],
    }),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type IngestionKey = typeof ingestionKeys.$inferSelect;
export type NewIngestionKey = typeof ingestionKeys.$inferInsert;
export type IngestionKeyIndex = typeof ingestionKeyIndexes.$inferSelect;
export type NewIngestionKeyIndex = typeof ingestionKeyIndexes.$inferInsert;
