// src/features/search/providers/elasticsearch/elasticsearch-field-mapping.ts

/**
 * Elasticsearch Field Mapping Utilities
 *
 * Maps application field types to Elasticsearch mapping types.
 * This is ES-specific — other providers have their own type systems
 * (e.g., Azure AI Search uses Edm.* types).
 */

import type { SearchIndexField } from '@/db/schema/search-index-fields.schema';
import { INTERAKT_TEXT_ANALYZER, INTERAKT_TEXT_SEARCH_ANALYZER } from './elasticsearch.constants';

/**
 * Map our field types to Elasticsearch types
 *
 * @param field - The search index field with type and analyzer settings
 * @returns ES mapping configuration for the field
 */
export function mapFieldTypeToES(field: SearchIndexField): Record<string, unknown> | null {
    const { fieldType, isAutocomplete, isFacetable, customAnalyzer } = field;

    switch (fieldType) {
        case 'text':
        case 'html':
        case 'markdown':
        case 'richtext': {
            const mapping: Record<string, unknown> = { type: 'text' };

            // Apply autocomplete analyzer if enabled
            if (isAutocomplete) {
                mapping.analyzer = 'autocomplete';
                mapping.search_analyzer = 'autocomplete_search';
            } else if (customAnalyzer) {
                // Apply custom analyzer if specified. No search_analyzer, so ES
                // uses the same analyzer on both sides — an explicit per-field
                // override wins over the index's language analysis.
                mapping.analyzer = customAnalyzer;
            } else {
                // Default: the analyzer pair built from the index's language and
                // stop words. Without this the field falls back to ES `standard`,
                // which does not stem — a search for "jackets" would then miss a
                // document containing "jacket". buildIndexSettings always defines
                // both analyzers, so these names are safe to reference here.
                mapping.analyzer = INTERAKT_TEXT_ANALYZER;
                mapping.search_analyzer = INTERAKT_TEXT_SEARCH_ANALYZER;
            }

            // Add keyword subfield for faceting/sorting if field is facetable
            // This allows terms aggregations on text fields via field.keyword
            if (isFacetable) {
                mapping.fields = {
                    keyword: {
                        type: 'keyword',
                        ignore_above: 256,
                    },
                };
            }

            return mapping;
        }

        case 'keyword':
        case 'slug':
        case 'id':
        case 'uuid':
        case 'email':
        case 'phone':
        case 'url':
        case 'image_url':
            return { type: 'keyword' };

        case 'number':
        case 'integer':
            return { type: 'integer' };

        case 'float':
        case 'decimal':
        case 'price':
        case 'currency':
        case 'percent':
        case 'rating':
            return { type: 'float' };

        case 'boolean':
            return { type: 'boolean' };

        case 'date':
        case 'datetime':
        case 'timestamp':
            return { type: 'date' };

        case 'array':
            // Arrays are handled automatically in ES
            return { type: 'keyword' };

        case 'json':
        case 'object':
            return { type: 'object', enabled: true };

        case 'geo_point':
            return { type: 'geo_point' };

        case 'nested':
            return { type: 'nested' };

        default:
            // Log unknown field types to help catch missing mappings
            console.warn(`[mapFieldTypeToES] Unknown field type: ${fieldType}, defaulting to text`);
            return { type: 'text' };
    }
}
