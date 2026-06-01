// db/schema/users.schema.ts

/**
 * Users Schema
 * Authentication and user management
 */

import { pgTable, uuid, varchar, timestamp, boolean } from 'drizzle-orm/pg-core';
import { userRoleEnum } from './enums.schema';

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
  role: userRoleEnum('role').default('user'),
});

// Export types
export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;