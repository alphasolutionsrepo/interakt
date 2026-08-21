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
     *
     * ## filterable vs facetable
     *
     * Azure treats these as independent capabilities, so a field you filter on but
     * never facet — an identifier such as `uniqueId` or `storyId` — needs
     * `filterable` without `facetable`. That is what `providerFieldSettings.isFilterable`
     * expresses; before it was honoured, the only way to filter a field was to
     * declare it a facet, and identifiers therefore could not be filtered at all.
     * Deletes addressed by id silently matched nothing as a result.
     *
     * `isFacetable` still implies `filterable`, and must keep doing so: every
     * existing index was built under that rule, so `locale`, `category` and
     * `keywords` are filterable today *because* they are facets. Requiring the new
     * flag instead would strip those on the next reindex and break site search.
     * The flag therefore only ever adds capability — no input makes a field less
     * filterable than it is now.
     */
    mapFieldType(field: {
        fieldType: string;
        isAutocomplete?: boolean;
        isFacetable?: boolean;
        customAnalyzer?: string | null;
        providerFieldSettings?: Record<string, unknown>;
    }): Record<string, unknown> | null {
        const edmType = FIELD_TYPE_TO_EDM[field.fieldType];
        if (!edmType) {
            return null; // Unknown type — skip
        }

        const isFacetable = field.isFacetable === true;
        const wantsFilterable = field.providerFieldSettings?.isFilterable === true || isFacetable;
        // The EDM type has the final say either way: Azure rejects filterable on
        // types that cannot support it, whatever the field config asks for.
        const supportsFiltering = FILTERABLE_EDM_TYPES.has(edmType);

        const result: Record<string, unknown> = {
            type: edmType,
            searchable: SEARCHABLE_EDM_TYPES.has(edmType),
            filterable: wantsFilterable && supportsFiltering,
            facetable: isFacetable && supportsFiltering,
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
