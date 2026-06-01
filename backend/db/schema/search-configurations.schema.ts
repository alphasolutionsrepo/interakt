// db/schema/search-configurations.schema.ts

/**
 * Search Configurations Schema
 * Configuration settings that link search indexes to response templates
 * and define search behavior
 */

import {
    pgTable,
    varchar,
    text,
    bigint,
    boolean,
    integer,
    timestamp,
    index
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { dataTemplates } from './data-templates.schema';
// import { responseTemplates } from './response-templates.schema'; // Will be created later

// ============================================================================
// SEARCH CONFIGURATIONS TABLE
// ============================================================================

/**
 * Search configurations define how a search index is used in the application.
 * They link indexes to response templates and set search behavior parameters.
 */
export const searchConfigurations = pgTable('search_configurations', {
    // ============================================================================
    // PRIMARY KEY & TIMESTAMPS
    // ============================================================================
    id: varchar('id', { length: 255 }).primaryKey(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),

    // ============================================================================
    // BASIC INFORMATION
    // ============================================================================
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),

    // ============================================================================
    // LINKAGE TO OTHER ENTITIES
    // ============================================================================
    // Name of the search index to use
    indexName: varchar('index_name', { length: 255 }).notNull(),

    // Data template this configuration uses
    dataTemplateId: bigint('data_template_id', { mode: 'number' }).notNull(),

    // Response template (optional) - how to format results
    enableResponseTemplates: boolean('enable_response_templates').default(true),
    responseTemplateId: bigint('response_template_id', { mode: 'number' }),

    // ============================================================================
    // SEARCH BEHAVIOR SETTINGS
    // ============================================================================
    // Default number of results to return
    defaultSearchSize: integer('default_search_size').default(10),

    // Maximum number of results allowed
    maxSearchSize: integer('max_search_size').default(100),

    // Minimum characters required for typeahead
    typeaheadMinLength: integer('typeahead_min_length').default(2),

    // Maximum typeahead suggestions
    typeaheadLimit: integer('typeahead_limit').default(5),

    // ============================================================================
    // PERFORMANCE SETTINGS
    // ============================================================================
    // Search timeout in milliseconds
    searchTimeoutMs: integer('search_timeout_ms').default(30000),

    // Enable result highlighting
    enableHighlighting: boolean('enable_highlighting').default(true),

    // Enable search analytics tracking
    enableAnalytics: boolean('enable_analytics').default(true),

    // ============================================================================
    // STATUS
    // ============================================================================
    isActive: boolean('is_active').default(true),

}, (table) => ({
    // Indexes for performance
    indexNameIdx: index('search_configurations_index_name_idx').on(table.indexName),
    dataTemplateIdIdx: index('search_configurations_data_template_id_idx').on(table.dataTemplateId),
    responseTemplateIdIdx: index('search_configurations_response_template_id_idx').on(table.responseTemplateId),
    isActiveIdx: index('search_configurations_is_active_idx').on(table.isActive),
}));

// ============================================================================
// RELATIONS
// ============================================================================

export const searchConfigurationsRelations = relations(searchConfigurations, ({ one }) => ({
    // Relation to search index (by name, not ID)
    // Note: This is a logical relation - searchIndex.name should match indexName

    dataTemplate: one(dataTemplates, {
        fields: [searchConfigurations.dataTemplateId],
        references: [dataTemplates.id],
    }),

    // Uncomment when response templates schema is created
    // responseTemplate: one(responseTemplates, {
    //   fields: [searchConfigurations.responseTemplateId],
    //   references: [responseTemplates.id],
    // }),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type SearchConfiguration = typeof searchConfigurations.$inferSelect;
export type NewSearchConfiguration = typeof searchConfigurations.$inferInsert;

// ============================================================================
// CONSTANTS
// ============================================================================

export const DEFAULT_SEARCH_SIZE = 10;
export const DEFAULT_MAX_SEARCH_SIZE = 100;
export const DEFAULT_TYPEAHEAD_MIN_LENGTH = 2;
export const DEFAULT_TYPEAHEAD_LIMIT = 5;
export const DEFAULT_SEARCH_TIMEOUT_MS = 30000;