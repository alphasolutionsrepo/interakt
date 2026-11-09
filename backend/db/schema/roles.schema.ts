// db/schema/roles.schema.ts

/**
 * Roles Schema
 * A role is a name and a set of permissions (see src/features/access/permissions.ts).
 * The built-in Admin role (is_built_in) holds every permission whatever its row says and
 * can't be edited or deleted. Every user has exactly one role.
 */

import { pgTable, uuid, varchar, text, timestamp, boolean } from 'drizzle-orm/pg-core';

export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  name: varchar('name', { length: 64 }).notNull().unique(),
  description: text('description'),
  permissions: text('permissions').array().notNull().default([]),
  isBuiltIn: boolean('is_built_in').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
