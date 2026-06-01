// src/features/search/providers/elasticsearch/elasticsearch-field-mapper.ts

/**
 * Elasticsearch Field Mapper
 *
 * Implements the FieldMapper interface for Elasticsearch.
 * Delegates to the existing mapFieldTypeToES utility, preserving exact behavior.
 */

import 'server-only';

import { mapFieldTypeToES } from './elasticsearch-field-mapping';
import type { SearchIndexField } from '@/db/schema/search-index-fields.schema';
import type { FieldMapper } from '../search-engine-provider.interface';

// Text-like field types that require .keyword subfield for aggregations
const TEXT_FIELD_TYPES = new Set([
    'text', 'html', 'markdown', 'richtext',
]);

export class ElasticsearchFieldMapper implements FieldMapper {
    /**
     * Map a field definition to Elasticsearch-specific mapping.
     *
     * Delegates to the existing mapFieldTypeToES function to preserve
     * exact mapping behavior (analyzers, keyword subfields, etc.).
     */
    mapFieldType(field: {
        fieldType: string;
        isAutocomplete?: boolean;
        isFacetable?: boolean;
        customAnalyzer?: string | null;
    }): Record<string, unknown> | null {
        // Cast to SearchIndexField shape — mapFieldTypeToES only reads these properties
        return mapFieldTypeToES(field as SearchIndexField);
    }

    /**
     * Get the correct field path for Elasticsearch aggregations.
     *
     * Text fields in Elasticsearch cannot be aggregated directly —
     * they must use the .keyword subfield for terms aggregations.
     */
    getAggregationFieldPath(fieldName: string, fieldType: string): string {
        if (TEXT_FIELD_TYPES.has(fieldType)) {
            return `${fieldName}.keyword`;
        }
        return fieldName;
    }

    /**
     * Build the dense_vector field mapping for Elasticsearch.
     *
     * ES uses `dense_vector` with `dims`, `index: true`, and a `similarity` function.
     * Other providers use different formats (e.g., Azure uses Collection(Edm.Single)
     * with a vectorSearchProfile reference).
     */
    mapVectorField(config: {
        fieldName: string;
        dimensions: number;
        similarity: string;
    }): Record<string, unknown> {
        return {
            type: 'dense_vector',
            dims: config.dimensions,
            index: true,
            similarity: config.similarity,
        };
    }
}
