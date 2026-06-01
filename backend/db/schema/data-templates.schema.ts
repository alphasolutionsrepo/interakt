// db/schema/data-templates.schema.ts

/**
 * Data Templates Schema
 * Tables: data_templates, data_template_fields
 */

import { pgTable, bigint, varchar, text, timestamp, boolean, doublePrecision, index } from 'drizzle-orm/pg-core';

// ============================================================================
// DATA TEMPLATES TABLE
// ============================================================================

export const dataTemplates = pgTable('data_templates', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  icon: varchar('icon', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  lastUpdatedBy: varchar('last_updated_by', { length: 255 }),
}, (table) => [
  index('data_templates_slug_idx').on(table.slug),
  index('data_templates_name_idx').on(table.name),
  index('data_templates_created_at_idx').on(table.createdAt),
]);

// ============================================================================
// DATA TEMPLATE FIELDS TABLE
// ============================================================================

export const dataTemplateFields = pgTable('data_template_fields', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  templateId: bigint('template_id', { mode: 'number' })
    .notNull()
    .references(() => dataTemplates.id, { onDelete: 'cascade' }),
  fieldName: varchar('field_name', { length: 255 }).notNull(),
  fieldType: varchar('field_type', { length: 50 }).notNull(),
  displayName: varchar('display_name', { length: 255 }),
  isRequired: boolean('is_required').default(false),
  isSearchable: boolean('is_searchable').default(true),
  isFacetable: boolean('is_facetable').default(false),
  includeInResponse: boolean('include_in_response').default(true),
  boostValue: doublePrecision('boost_value').default(1.0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  updatedBy: varchar('updated_by', { length: 255 }),
}, (table) => [
  index('data_template_fields_template_id_idx').on(table.templateId),
  index('data_template_fields_template_id_searchable_idx').on(table.templateId, table.isSearchable),
  index('data_template_fields_template_id_facetable_idx').on(table.templateId, table.isFacetable),
  index('data_template_fields_field_name_idx').on(table.fieldName),
  index('data_template_fields_field_type_idx').on(table.fieldType),
]);

// Export types for TypeScript inference
export type DataTemplate = typeof dataTemplates.$inferSelect;
export type NewDataTemplate = typeof dataTemplates.$inferInsert;
export type DataTemplateField = typeof dataTemplateFields.$inferSelect;
export type NewDataTemplateField = typeof dataTemplateFields.$inferInsert;