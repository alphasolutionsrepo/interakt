// db/schema/secrets.schema.ts

/**
 * Secrets Vault Schema
 *
 * Stores encrypted secrets (API keys, tokens, etc.) that tools
 * reference via {{secret:name}} syntax. Values are encrypted at rest
 * using AES-256-GCM with a master key from environment.
 *
 * The secrets provider interface is designed to be swappable with
 * cloud-based vaults (AWS Secrets Manager, Azure Key Vault, etc.).
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

// ============================================================================
// SECRETS TABLE
// ============================================================================

export const secrets = pgTable('secrets', {
  id: uuid('id').primaryKey().defaultRandom(),

  /** Unique reference key (e.g., "ahlsell_api_key", "tavily_key") */
  name: varchar('name', { length: 100 }).notNull().unique(),

  /** Encrypted value — never exposed via API, decrypted only at execution time */
  encryptedValue: text('encrypted_value').notNull(),

  /** Human-readable note about what this secret is for */
  description: text('description'),

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIT
  // ═══════════════════════════════════════════════════════════════════════════
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedBy: uuid('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),

}, (table) => ({
  nameIdx: index('secrets_name_idx').on(table.name),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type Secret = typeof secrets.$inferSelect;
export type NewSecret = typeof secrets.$inferInsert;
