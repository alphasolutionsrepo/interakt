// db/schema/users.schema.ts

/**
 * Users Schema
 * Authentication and user management
 */

import { pgTable, uuid, varchar, timestamp, boolean } from 'drizzle-orm/pg-core';
import { roles } from './roles.schema';

// ============================================================================
// USERS TABLE
// ============================================================================

export const user = pgTable('user', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  email: varchar('email', { length: 64 }).notNull(),
  password: varchar('password', { length: 64 }),
  firstName: varchar('firstName', { length: 64 }),
  lastName: varchar('lastName', { length: 64 }),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  isActive: boolean('isActive').default(true),
  // Every user has one role; a role in use can't be deleted (restrict).
  roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'restrict' }),
});

// Export types
export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;