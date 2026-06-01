// src/features/search/providers/azure-ai-search/azure-field-mapper.ts

/**
 * Azure AI Search Field Mapper
 *
 * Maps app-level field types to Azure Edm types and builds
 * vector field definitions using Azure's vectorSearch profiles.
 */

import 'server-only';

import { FIELD_TYPE_TO_EDM, SEARCHABLE_EDM_TYPES, FILTERABLE_EDM_TYPES } from './azure-constants';
import type { FieldMapper } from '../search-engine-provider.interface';

// Text-like field types that support faceting via the filterable flag
const TEXT_FIELD_TYPES = new Set([
    'text', 'html', 'markdown', 'richtext',
]);

export class AzureFieldMapper implements FieldMapper {
    /**
     * Map a field definition to Azure-specific field definition.
     *
     * Azure fields have: name, type, searchable, filterable, sortable, facetable, key
     * This returns the field properties (without the name — caller adds it).
     */
    mapFieldType(field: {
        fieldType: string;
        isAutocomplete?: boolean;
        isFacetable?: boolean;
        customAnalyzer?: string | null;
    }): Record<string, unknown> | null {
        const edmType = FIELD_TYPE_TO_EDM[field.fieldType];
        if (!edmType) {
            return null; // Unknown type — skip
        }

        const result: Record<string, unknown> = {
            type: edmType,
            searchable: SEARCHABLE_EDM_TYPES.has(edmType),
            filterable: field.isFacetable === true && FILTERABLE_EDM_TYPES.has(edmType),
            facetable: field.isFacetable === true && FILTERABLE_EDM_TYPES.has(edmType),
            sortable: false,
            retrievable: true, // Ensure all mapped fields are retrievable for $select
        };

        // Azure uses built-in analyzers rather than custom analyzer names
        if (field.customAnalyzer && SEARCHABLE_EDM_TYPES.has(edmType)) {
            result.analyzer = field.customAnalyzer;
        }

        return result;
    }

    /**
     * Get the correct field path for Azure aggregations.
     *
     * Azure handles aggregations differently — facetable fields can be aggregated directly.
     * No .keyword subfield needed like Elasticsearch.
     */
    getAggregationFieldPath(fieldName: string, _fieldType: string): string {
        // Azure uses the field name directly for facets
        return fieldName;
    }

    /**
     * Build the vector field definition for Azure AI Search.
     *
     * Azure uses Collection(Edm.Single) for vector fields with a
     * vectorSearchProfile reference linking to the HNSW algorithm config.
     */
    mapVectorField(config: {
        fieldName: string;
        dimensions: number;
        similarity: string;
    }): Record<string, unknown> {
        return {
            type: 'Collection(Edm.Single)',
            searchable: true,
            filterable: false,
            sortable: false,
            facetable: false,
            retrievable: false, // Vectors are large — don't return in search results
            // SDK uses vectorSearchProfileName (REST API: vectorSearchConfiguration)
            vectorSearchProfileName: 'default-vector-profile',
            // SDK uses vectorSearchDimensions (REST API: dimensions)
            vectorSearchDimensions: config.dimensions,
        };
    }
}
