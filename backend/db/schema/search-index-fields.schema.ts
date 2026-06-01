// db/schema/search-index-fields.schema.ts

/**
 * Search Index Fields Schema
 * 
 * Stores snapshotted field definitions for each search index.
 * Fields are copied from DataTemplateFields at index creation time,
 * providing independence from the original template.
 * 
 * Combines:
 * - Field definition (snapshotted from template)
 * - Source mapping (which source JSON field maps to this)
 * - Search behavior (editable per index)
 * - Index behavior (ES-specific settings)
 */

import {
    pgTable,
    bigint,
    uuid,
    varchar,
    boolean,
    doublePrecision,
    json,
    timestamp,
    index,
    unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { searchIndex } from './search-index.schema';
import type { FieldTransformConfig } from '@/shared/constants/search-index.constants';

// ============================================================================
// SEARCH INDEX FIELDS TABLE
// ============================================================================

export const searchIndexFields = pgTable('search_index_fields', {
    // ========================================================================
    // IDENTITY
    // ========================================================================
    id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),

    searchIndexId: uuid('search_index_id')
        .notNull()
        .references(() => searchIndex.id, { onDelete: 'cascade' }),

    // ========================================================================
    // FIELD DEFINITION (Snapshotted from DataTemplateField)
    // ========================================================================
    
    /**
     * Field name in the index (e.g., "title", "price", "additionalData")
     * Copied from template field at creation time
     */
    fieldName: varchar('field_name', { length: 255 }).notNull(),

    /**
     * Field type (e.g., "text", "keyword", "number", "json")
     * Copied from template field at creation time
     */
    fieldType: varchar('field_type', { length: 50 }).notNull(),

    /**
     * Human-readable display name for UI
     * Copied from template, can be edited per index
     */
    displayName: varchar('display_name', { length: 255 }),

    /**
     * Reference to original template field (for audit trail)
     * Legacy — kept as nullable column, FK removed
     */
    originalTemplateFieldId: bigint('original_template_field_id', { mode: 'number' }),

    /**
     * Whether this is a system field (uniqueId, additionalData, customFields, etc.)
     * System fields have special UI treatment but no different behavior
     */
    isSystemField: boolean('is_system_field').notNull().default(false),

    // ========================================================================
    // SEARCH BEHAVIOR (Snapshotted from template, editable per index)
    // ========================================================================

    /**
     * Whether this field is required during mapping
     * If true, must be mapped before indexing can start
     */
    isRequired: boolean('is_required').notNull().default(false),

    /**
     * Whether this field is searchable (included in search queries)
     */
    isSearchable: boolean('is_searchable').notNull().default(true),

    /**
     * Whether this field supports faceting/aggregations
     */
    isFacetable: boolean('is_facetable').notNull().default(false),

    /**
     * Whether to include this field in search response
     */
    includeInResponse: boolean('include_in_response').notNull().default(true),

    /**
     * Search relevance boost multiplier (1.0 = normal)
     */
    boostValue: doublePrecision('boost_value').notNull().default(1.0),

    // ========================================================================
    // SOURCE MAPPING
    // ========================================================================

    /**
     * Name of the field in source JSON (e.g., "productTitle", "metadata")
     * NULL if not yet mapped
     */
    sourceFieldName: varchar('source_field_name', { length: 255 }),

    /**
     * JSONPath for nested fields (e.g., "metadata.sku", "images[0].url")
     * NULL for top-level fields
     */
    sourceFieldPath: varchar('source_field_path', { length: 500 }),

    /**
     * Whether this field has been mapped to a source field
     * Explicit flag for clarity (could be derived from sourceFieldName != null)
     */
    isMapped: boolean('is_mapped').notNull().default(false),

    // ========================================================================
    // INDEX BEHAVIOR (ES-specific settings)
    // ========================================================================

    /**
     * Whether to index this field in ES
     * If false, field is stored but not searchable
     */
    isIndexed: boolean('is_indexed').notNull().default(true),

    /**
     * Whether this field is used as source for vector embeddings
     * For semantic/hybrid search
     */
    isVectorSource: boolean('is_vector_source').notNull().default(false),

    /**
     * Whether this field is used for autocomplete suggestions.
     * When true, an edge_ngram analyzer is applied for fast prefix matching.
     * Only applies to text fields.
     *
     * IMPORTANT: Changing this requires reindexing as it affects ES mappings.
     */
    isAutocomplete: boolean('is_autocomplete').notNull().default(false),

    /**
     * Custom ES analyzer for this field (overrides index default)
     * NULL = use index default analyzer
     *
     * When isAutocomplete=true, this is automatically set to 'autocomplete'.
     *
     * IMPORTANT: Changing this requires reindexing as it affects ES mappings.
     */
    customAnalyzer: varchar('custom_analyzer', { length: 50 }),

    /**
     * Provider-specific field settings stored as JSON.
     * Each provider stores different settings:
     *   ES: { isAutocomplete, customAnalyzer }
     *   Azure: { isFilterable, isSortable }
     *
     * Replaces isAutocomplete and customAnalyzer above (kept for backward compat).
     */
    providerFieldSettings: json('provider_field_settings').$type<Record<string, unknown>>().default({}),

    /**
     * Transform configuration for field values during indexing
     * e.g., { type: 'lowercase' } or { type: 'trim' }
     */
    transformConfig: json('transform_config').$type<FieldTransformConfig>().default({ type: 'none' }),

    // ========================================================================
    // FILTER VALUE MAPPINGS
    // ========================================================================

    /**
     * Canonical value mappings for filter validation and normalization.
     * Maps user/system-suggested values to actual indexed values.
     * Only relevant for facetable fields.
     *
     * Structure: { "CanonicalValue": ["alias1", "alias2", ...] }
     * Example: { "Men": ["men", "male", "boys"], "Women": ["women", "female", "ladies"] }
     *
     * When a filter value is suggested:
     * 1. Normalize (lowercase, trim)
     * 2. Check if it matches a canonical value or any alias
     * 3. If match found, use the canonical value
     * 4. If no match, drop the filter (logged for analytics)
     */
    filterValueMappings: json('filter_value_mappings').$type<Record<string, string[]>>().default({}),

    // ========================================================================
    // METADATA
    // ========================================================================
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),

}, (table) => ({
    // Performance indexes
    searchIndexIdIdx: index('idx_sif_search_index_id').on(table.searchIndexId),
    fieldNameIdx: index('idx_sif_field_name').on(table.searchIndexId, table.fieldName),
    isMappedIdx: index('idx_sif_is_mapped').on(table.searchIndexId, table.isMapped),
    isSystemFieldIdx: index('idx_sif_is_system_field').on(table.searchIndexId, table.isSystemField),
    // Unique constraints
    uniqueFieldPerIndex: unique('unique_sif_field_per_index').on(table.searchIndexId, table.fieldName),
    uniqueSourceMapping: unique('unique_sif_source_mapping').on(table.searchIndexId, table.sourceFieldName),
}));

// ============================================================================
// RELATIONS
// ============================================================================

export const searchIndexFieldsRelations = relations(searchIndexFields, ({ one }) => ({
    searchIndex: one(searchIndex, {
        fields: [searchIndexFields.searchIndexId],
        references: [searchIndex.id],
    }),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type SearchIndexField = typeof searchIndexFields.$inferSelect;
export type NewSearchIndexField = typeof searchIndexFields.$inferInsert;