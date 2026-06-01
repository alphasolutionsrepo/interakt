// db/schema/seed-registry.schema.ts

/**
 * Seed Registry Schema
 * Tracks seeded data to enable idempotent seeding with change detection
 */

import { pgTable, bigint, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';

// ============================================================================
// SEED REGISTRY TABLE
// ============================================================================

export const seedRegistry = pgTable('seed_registry', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  
  /**
   * Type of seed (e.g., 'data-template', 'ai-provider', 'response-template')
   */
  seedType: varchar('seed_type', { length: 50 }).notNull(),
  
  /**
   * Unique key for this seed within its type (e.g., 'product-catalog', 'ollama')
   */
  seedKey: varchar('seed_key', { length: 100 }).notNull(),
  
  /**
   * SHA-256 checksum of the seed data for change detection
   */
  checksum: varchar('checksum', { length: 64 }).notNull(),
  
  /**
   * Optional metadata about the seed (JSON)
   */
  metadata: text('metadata'),
  
  /**
   * When this seed was first applied
   */
  seededAt: timestamp('seeded_at').defaultNow().notNull(),
  
  /**
   * When this seed was last updated
   */
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('seed_registry_type_key_idx').on(table.seedType, table.seedKey),
  index('seed_registry_type_idx').on(table.seedType),
]);

// ============================================================================
// TYPES
// ============================================================================

export type SeedRegistry = typeof seedRegistry.$inferSelect;
export type NewSeedRegistry = typeof seedRegistry.$inferInsert;

// ============================================================================
// SEED TYPES ENUM
// ============================================================================

/**
 * Seed types for type safety
 * Add new seed types here when creating new seeders
 */
export const SEED_TYPES = {
  DATA_TEMPLATE: 'data-template',
  AI_PROVIDER: 'ai-provider',
  RESPONSE_TEMPLATE: 'response-template',
  USER: 'user',
  CONFIG: 'config',
  DEMO: 'demo',
  DOCS: 'docs',
} as const;

export type SeedType = typeof SEED_TYPES[keyof typeof SEED_TYPES];