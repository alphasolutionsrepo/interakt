// ============================================================================
// DISPLAY CONFIG TYPES (from backend)
// ============================================================================

export type DisplayFieldRole = 'title' | 'subtitle' | 'description' | 'image' | 'price' | 'badge' | 'secondary' | 'link';

export interface DisplayField {
  fieldName: string;
  role: DisplayFieldRole;
  label?: string;
  order: number;
}

export interface DisplayConfig {
  displayFields: DisplayField[];
  layout?: {
    showScore?: boolean;
    showHighlights?: boolean;
  };
}

// ============================================================================
// SEARCH TYPES
// ============================================================================

export interface SearchResult {
  id: string;
  score: number;
  source: Record<string, unknown>;
  highlights?: Record<string, string[]>;
}

export interface FacetBucket {
  key: string | number;
  count: number;
}

export interface Facet {
  field: string;
  type: string;
  buckets: FacetBucket[];
}

export interface Pagination {
  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface SearchResponse {
  results: SearchResult[];
  total: {
    value: number;
    relation: 'eq' | 'gte';
  };
  pagination: Pagination;
  facets?: Facet[];
  took: number;
  searchExperienceId: string;
  indexesSearched: Array<{
    id: string;
    name: string;
    displayName: string;
  }>;
  displayConfig?: DisplayConfig;
}

export interface SearchRequest {
  query: string;
  page?: number;
  pageSize?: number;
  filters?: Array<{
    field: string;
    operator: string;
    value: unknown;
  }>;
  facets?: Array<{
    field: string;
    type?: string;
    size?: number;
  }>;
  sort?: Array<{
    field: string;
    direction: 'asc' | 'desc';
  }>;
}

// ============================================================================
// AUTOCOMPLETE TYPES
// ============================================================================

export interface AutocompleteSuggestion {
  text: string;
  score?: number;
  highlights?: string[];
}

export interface AutocompleteResponse {
  suggestions: AutocompleteSuggestion[];
  took: number;
}

export interface AutocompleteRequest {
  query: string;
  limit?: number;
}

// ============================================================================
// SUMMARIZE TYPES
// ============================================================================

export interface SummarizeRequest {
  query: string;
  results: Array<{
    id: string;
    index: { id: string; name: string };
    fields: Record<string, unknown>;
  }>;
  totalResults?: number;
  instruction?: string;
}

// SSE event types
export type SummarizeEvent =
  | { type: 'content'; text: string }
  | { type: 'done'; usage?: { promptTokens: number; completionTokens: number; totalTokens: number }; messageId?: string }
  | { type: 'error'; error: string };

// ============================================================================
// ERROR TYPES
// ============================================================================

export interface ApiError {
  error: string;
  code?: string;
  status?: number;
}
