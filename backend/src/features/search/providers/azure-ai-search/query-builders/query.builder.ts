// src/features/search/providers/azure-ai-search/query-builders/query.builder.ts

/**
 * Azure AI Search Query Builder
 *
 * Builds Azure search request options from the provider-agnostic search request format.
 * Azure AI Search uses a single search() call that can combine:
 * - Full-text search (searchText)
 * - Vector search (vectorQueries)
 * - Semantic ranking (queryType: 'semantic')
 * - Filters ($filter in OData format)
 * - Facets (facets array)
 *
 * For hybrid search, Azure performs native RRF fusion internally —
 * no custom fusion implementation needed.
 */

import 'server-only';

import type {
    ProviderSearchRequest,
} from '../../../search.types';
import { buildAzureFilter } from './filter.builder';

/**
 * Azure search options shape (subset of SearchOptions from @azure/search-documents).
 */
export interface AzureSearchOptions {
    searchText: string;
    searchFields?: string[];
    filter?: string;
    orderBy?: string[];
    select?: string[];
    top?: number;
    skip?: number;
    includeTotalCount?: boolean;
    facets?: string[];
    highlightFields?: string;
    highlightPreTag?: string;
    highlightPostTag?: string;
    queryType?: 'simple' | 'full' | 'semantic';
    /** SDK v12 uses semanticSearchOptions with nested configurationName */
    semanticSearchOptions?: {
        configurationName?: string;
    };
    vectorQueries?: AzureVectorQuery[];
}

export interface AzureVectorQuery {
    kind: 'vector';
    vector: number[];
    fields: string;
    kNearestNeighborsCount: number;
}

/**
 * Build Azure search options from a ProviderSearchRequest.
 */
export function buildAzureSearchOptions(providerRequest: ProviderSearchRequest): AzureSearchOptions {
    const { context, request, searchType, queryEmbedding } = providerRequest;

    const pageSize = request.pageSize ?? 20;
    const page = request.page ?? 1;

    const options: AzureSearchOptions = {
        searchText: request.query || '*',
        top: pageSize,
        skip: (page - 1) * pageSize,
        includeTotalCount: true,
    };

    // Search fields (from context — which fields to search across)
    // Note: Azure AI Search does NOT support field^boost syntax in searchFields.
    // Field boosting in Azure is handled via scoring profiles at the index level.
    if (context.searchableFields.length > 0) {
        options.searchFields = context.searchableFields.map(f => f.fieldName);
    }

    // Select fields (what to return in results)
    // Always include 'id' (the key field) so document IDs are available for React keys, etc.
    const responseFields = request.includeFields ?? context.defaultResponseFields;
    if (responseFields.length > 0) {
        const fieldsWithId = responseFields.includes('id')
            ? responseFields
            : ['id', ...responseFields];
        options.select = fieldsWithId;
    }

    // Filters (convert FilterClause[] to OData $filter string)
    // Pass field types so Collection fields use lambda expressions (any/all)
    if (request.filters && request.filters.length > 0) {
        options.filter = buildAzureFilter(request.filters, context.allFields);
    }

    // Sorting
    // Track whether explicit field-based sorting is requested (excludes _score)
    const hasExplicitSort = request.sort && request.sort.some(s => s.field !== '_score');
    if (request.sort && request.sort.length > 0) {
        options.orderBy = request.sort
            .filter(s => s.field !== '_score') // Azure doesn't support explicit score sorting
            .map(s => s.direction === 'desc' ? `${s.field} desc` : `${s.field} asc`);
    }

    // Facets (from request or context)
    const facetFields = request.facets?.map(f => f.field)
        ?? context.facetableFields.map(f => f.fieldName);
    if (facetFields.length > 0) {
        options.facets = facetFields.map(f => `${f},count:100`);
    }

    // Highlighting (from request or context searchable fields)
    const highlightFields = request.highlight?.fields
        ?? context.searchableFields.map(f => f.fieldName);
    if (highlightFields.length > 0) {
        options.highlightFields = highlightFields.join(',');
        options.highlightPreTag = request.highlight?.preTag ?? '<mark>';
        options.highlightPostTag = request.highlight?.postTag ?? '</mark>';
    }

    // Semantic search — Azure uses queryType: 'semantic' with semanticSearchOptions.
    // Azure does NOT allow orderBy + queryType:'semantic' together — when explicit
    // field-based sorting is requested (e.g., sort by price), skip semantic reranking
    // so the sort order is respected.
    if ((searchType === 'semantic' || searchType === 'hybrid') && !hasExplicitSort) {
        options.queryType = 'semantic';
        options.semanticSearchOptions = {
            configurationName: 'default-semantic-config',
        };
    }

    // Vector search (for semantic and hybrid) — Azure native hybrid via single request
    if (queryEmbedding && context.embedding) {
        options.vectorQueries = [
            {
                kind: 'vector',
                vector: queryEmbedding,
                fields: context.embedding.fieldName,
                kNearestNeighborsCount: pageSize,
            },
        ];
    }

    return options;
}
