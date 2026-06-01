export interface ProductData {
  // Core fields that most datasets have
  id?: string;
  title?: string;
  description?: string;
  image?: string;
  price?: number | string;
  sale_price?: number | string;
  
  // Allow any additional fields for flexibility
  [key: string]: any;
}

export interface SearchResult {
  id: string;
  score: number;
  data: ProductData;
  metadata: {
    fieldDisplayNames: Record<string, string>;
    fieldTypes: Record<string, string>;
    templateId: number;
  };
}

export interface FacetBucket {
  key: string;
  doc_count: number;
  original_key: string;
}

export interface SearchFacet {
  fieldName: string;
  facetType: string;
  buckets: FacetBucket[];
  total_buckets: number;
  doc_count_error_upper_bound: number;
  sum_other_doc_count: number;
}

export interface FacetValue {
  value: string;
  label: string;
  count: number;
  selected?: boolean;
}

export interface SearchStats {
  total: number;
  duration: number;
}

export interface SearchResponse {
  results: any[];
  formattedResults: SearchResult[];
  total: number;
  suggestions: string[];
  facets: Record<string, SearchFacet>;
  pagination: {
    currentPage: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    from: number;
    to: number;
    itemsOnCurrentPage: number;
  };
  metadata: {
    searchType: string;
    executionTimeMs: number;
    searchConfigId: string;
    searchConfigName: string;
    hasTemplate: boolean;
    facetsEnabled: boolean;
    facetCount: number;
    responseTemplateId: number;
    responseTemplateName: string;
  };
}

export interface SearchState {
  searchResults: SearchResult[];
  facets: Record<string, SearchFacet>;
  isLoading: boolean;
  searchStats: SearchStats;
  selectedFacets: Record<string, string[]>;
}