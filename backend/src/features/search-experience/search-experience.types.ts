// src/features/search-experience/search-experience.types.ts

/**
 * Search Experience Types
 *
 * Domain types for the search experience feature.
 * These types are used throughout the application layer.
 */

import type {
  SearchExperience as DBSearchExperience,
  SearchExperienceIndex as DBSearchExperienceIndex,
  SearchExperienceSearchConfig,
  SearchExperienceAIConfig,
  SearchExperienceToolsConfig,
  SearchExperienceRateLimitConfig,
  SearchExperienceAutocompleteConfig,
  SearchExperienceHybridConfig,
  SearchExperienceDisplayConfig,
  SearchExperienceDisplayField,
} from '@/db/schema/search-experience.schema';

// Re-export JSON types from schema
export type {
  SearchExperienceSearchConfig,
  SearchExperienceAIConfig,
  SearchExperienceToolsConfig,
  SearchExperienceRateLimitConfig,
  SearchExperienceAutocompleteConfig,
  SearchExperienceHybridConfig,
  SearchExperienceDisplayConfig,
  SearchExperienceDisplayField,
};

// ============================================================================
// ENTITY TYPES
// ============================================================================

/**
 * Search Experience entity (from database)
 */
export type SearchExperience = DBSearchExperience;

/**
 * Search Experience Index junction entity (from database)
 */
export type SearchExperienceIndex = DBSearchExperienceIndex;

/**
 * Search Experience with related indexes
 */
export interface SearchExperienceWithIndexes extends SearchExperience {
  indexes: Array<SearchExperienceIndex & {
    searchIndex: {
      id: string;
      name: string;
      displayName: string;
      description: string | null;
      searchType: string;
      searchProvider: string;
      isActive: boolean;
    };
  }>;
}

/**
 * Search Experience summary for lists
 */
export interface SearchExperienceSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  indexCount: number;
  aiEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Public search request (from external clients)
 */
export interface PublicSearchRequest {
  query: string;
  indexId?: string; // Optional: specific index to search
  searchType?: 'lexical' | 'semantic' | 'hybrid' | 'auto';
  filters?: Array<{
    field: string;
    operator: string;
    value: unknown;
    filters?: unknown[];
  }>;
  facets?: Array<{
    field: string;
    type?: string;
    size?: number;
  }>;
  page?: number;
  pageSize?: number;
  sort?: Array<{
    field: string;
    direction: 'asc' | 'desc';
  }>;
  includeFields?: string[];
  excludeFields?: string[];
}

/**
 * Public search response
 */
export interface PublicSearchResponse {
  results: Array<{
    id: string;
    score: number;
    source: Record<string, unknown>;
    highlights?: Record<string, string[]>;
  }>;
  total: {
    value: number;
    relation: 'eq' | 'gte';
  };
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  facets?: Array<{
    field: string;
    type: string;
    buckets: Array<{
      key: string | number;
      count: number;
    }>;
  }>;
  took: number;
  searchExperienceId: string;
  indexesSearched: Array<{
    id: string;
    name: string;
    displayName: string;
  }>;
  /** Display configuration for frontend rendering */
  displayConfig?: SearchExperienceDisplayConfig;
}

// ============================================================================
// INPUT TYPES (for creating/updating)
// ============================================================================

/**
 * Input for creating a search experience
 */
export interface CreateSearchExperienceInput {
  name: string;
  slug: string;
  description?: string;
  searchConfig: SearchExperienceSearchConfig;
  aiConfig: SearchExperienceAIConfig;
  toolsConfig?: SearchExperienceToolsConfig;
  allowedOrigins?: string[];
  rateLimitConfig?: SearchExperienceRateLimitConfig;
  displayConfig?: SearchExperienceDisplayConfig;
  indexes: Array<{
    searchIndexId: string;
    role?: 'primary' | 'secondary';
    weight?: number;
    sortOrder?: number;
    aiDescription?: string;
  }>;
}

/**
 * Input for updating a search experience
 */
export interface UpdateSearchExperienceInput {
  name?: string;
  slug?: string;
  description?: string | null;
  searchConfig?: Partial<SearchExperienceSearchConfig>;
  aiConfig?: Partial<SearchExperienceAIConfig>;
  toolsConfig?: Partial<SearchExperienceToolsConfig>;
  allowedOrigins?: string[];
  rateLimitConfig?: SearchExperienceRateLimitConfig | null;
  displayConfig?: SearchExperienceDisplayConfig | null;
  isActive?: boolean;
  telemetryDetailLevel?: 'off' | 'metadata' | 'full';
}

/**
 * Input for adding an index to a search experience
 */
export interface AddSearchExperienceIndexInput {
  searchIndexId: string;
  role?: 'primary' | 'secondary';
  weight?: number;
  sortOrder?: number;
  aiDescription?: string;
}

/**
 * Input for updating an index in a search experience
 */
export interface UpdateSearchExperienceIndexInput {
  role?: 'primary' | 'secondary';
  weight?: number;
  sortOrder?: number;
  aiDescription?: string | null;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Filter clause for search
 */
export interface FilterClause {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'contains' | 'prefix' | 'exists' | 'missing' | 'range';
  value: unknown;
}

/**
 * Facet request
 */
export interface FacetRequest {
  field: string;
  type?: 'terms' | 'range' | 'date_range' | 'histogram';
  size?: number;
  ranges?: Array<{ from?: number; to?: number; key?: string }>;
}

/**
 * Sort clause
 */
export interface SortClause {
  field: string;
  order: 'asc' | 'desc';
}

/**
 * Search API request
 */
export interface SearchAPIRequest {
  query: string;
  indexes?: string[];
  filters?: FilterClause[];
  facets?: string[] | FacetRequest[];
  page?: number;
  pageSize?: number;
  sort?: SortClause[];
  includeHighlights?: boolean;
}

/**
 * Search result hit
 */
export interface SearchHit {
  id: string;
  index: {
    id: string;
    name: string;
  };
  score: number;
  fields: Record<string, unknown>;
  highlights?: Record<string, string[]>;
}

/**
 * Facet result bucket
 */
export interface FacetBucket {
  key: string;
  count: number;
  from?: number;
  to?: number;
}

/**
 * Facet result
 */
export interface FacetResult {
  field: string;
  buckets: FacetBucket[];
}

/**
 * Search API response data
 */
export interface SearchAPIResponseData {
  query: string;
  results: SearchHit[];
  facets?: Record<string, FacetResult>;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  searchedIndexes: Array<{
    id: string;
    name: string;
    resultCount: number;
  }>;
  took: number;
}

/**
 * Summarize API request
 */
export interface SummarizeAPIRequest {
  query: string;
  filters?: FilterClause[];
  results: Array<{
    id: string;
    index: { id: string; name: string };
    fields: Record<string, unknown>;
  }>;
  totalResults?: number;
  instruction?: string;
}

/**
 * Summarize API response data
 */
export interface SummarizeAPIResponseData {
  summary: string;
  sourcesUsed: Array<{
    id: string;
    indexName: string;
    title?: string;
  }>;
  usage: TokenUsage;
}

/**
 * Token usage
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Document reference (for sources)
 */
export interface DocumentReference {
  id: string;
  indexId: string;
  indexName: string;
  title?: string;
  relevance?: number;
}

// ============================================================================
// STREAMING EVENT TYPES
// ============================================================================

/**
 * Search result for streaming to frontend
 */
export interface StreamSearchResult {
  id: string;
  fields: Record<string, unknown>;
  highlights?: Record<string, string[]>;
  score?: number;
}

/**
 * Chat stream events
 *
 * Events sent during chat streaming:
 * - tool_call: AI requested a tool use (search)
 * - tool_result: Result from tool execution
 * - search_results: Full search results for frontend rendering (sent after tool_result)
 * - response_start: AI is generating final response (frontend shows typing indicator)
 * - content: Text content from AI (for markdown streaming)
 * - preset: Structured response with preset format (frontend renders progressively)
 * - sources: Document references used
 * - done: Stream complete with usage stats
 * - error: Error occurred
 */
export type ChatStreamEvent =
  | { type: 'tool_call'; id: string; name: string; arguments: unknown }
  | { type: 'tool_result'; id: string; name: string; result: unknown }
  | { type: 'search_results'; results: StreamSearchResult[] }
  | { type: 'response_start' }
  | { type: 'content'; text: string }
  | { type: 'preset'; preset: string; content: unknown }
  | { type: 'sources'; sources: DocumentReference[] }
  | { type: 'done'; usage: TokenUsage; messageId: string }
  | { type: 'error'; error: string; code?: string };

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Search experience error codes
 */
export type SearchExperienceErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'AI_UNAVAILABLE'
  | 'SEARCH_FAILED'
  | 'INTERNAL_ERROR';

// ============================================================================
// DEFAULT VALUES
// ============================================================================

export const DEFAULT_AUTOCOMPLETE_CONFIG: SearchExperienceAutocompleteConfig = {
  enabled: true,
  minLength: 2,
  maxSuggestions: 8,
  debounceMs: 150,
};

/**
 * Default hybrid search configuration
 * These values provide balanced lexical/semantic weighting
 */
export const DEFAULT_HYBRID_CONFIG: SearchExperienceHybridConfig = {
  lexicalWeight: 1.0,
  semanticWeight: 1.0,
  rrfRankConstant: 60,
  rrfWindowSize: 100,
};

export const DEFAULT_SEARCH_CONFIG: SearchExperienceSearchConfig = {
  defaultPageSize: 10,
  maxPageSize: 100,
  enableHighlighting: true,
  enableFacets: true,
  multiIndexStrategy: 'auto',
  resultMergeStrategy: 'scored',
  maxIndexesPerQuery: 5,
  autocomplete: DEFAULT_AUTOCOMPLETE_CONFIG,
  // hybridConfig is optional - if not set, uses index-level defaults
};

export const DEFAULT_AI_SUMMARY_CONFIG = {
  enabled: true,
  maxResultsForContext: 10,
  maxTokens: 500,
};

export const DEFAULT_AI_CONFIG: SearchExperienceAIConfig = {
  enabled: true,
  providerId: null,
  modelId: null,
  summary: DEFAULT_AI_SUMMARY_CONFIG,
};

export const DEFAULT_TOOLS_CONFIG: SearchExperienceToolsConfig = {
  enabled: ['search'],
  settings: {},
};

export const DEFAULT_RATE_LIMIT_CONFIG: SearchExperienceRateLimitConfig = {
  searchPerMinute: 60,
  chatPerMinute: 30,
};

// ============================================================================
// UI INFO OBJECTS (for admin pages)
// ============================================================================

/**
 * Multi-index strategy options
 */
export type MultiIndexStrategy = 'auto' | 'all' | 'primary_only';

export const MULTI_INDEX_STRATEGIES: MultiIndexStrategy[] = ['auto', 'all', 'primary_only'];

export const MULTI_INDEX_STRATEGY_INFO: Record<MultiIndexStrategy, { label: string; description: string }> = {
  auto: {
    label: 'Auto',
    description: 'AI determines which indexes to search based on the query',
  },
  all: {
    label: 'All Indexes',
    description: 'Search all connected indexes for every query',
  },
  primary_only: {
    label: 'Primary Only',
    description: 'Only search indexes marked as primary',
  },
};

/**
 * Result merge strategy options
 */
export type ResultMergeStrategy = 'interleave' | 'grouped' | 'scored';

export const RESULT_MERGE_STRATEGIES: ResultMergeStrategy[] = ['interleave', 'grouped', 'scored'];

export const RESULT_MERGE_STRATEGY_INFO: Record<ResultMergeStrategy, { label: string; description: string }> = {
  interleave: {
    label: 'Interleave',
    description: 'Alternate results from each index',
  },
  grouped: {
    label: 'Grouped',
    description: 'Group results by source index',
  },
  scored: {
    label: 'Scored (RRF)',
    description: 'Rank using Reciprocal Rank Fusion algorithm',
  },
};

/**
 * Index role in a search experience
 */
export type IndexRole = 'primary' | 'secondary';

export const INDEX_ROLES: IndexRole[] = ['primary', 'secondary'];

export const INDEX_ROLE_INFO: Record<IndexRole, { label: string; description: string; color: string }> = {
  primary: {
    label: 'Primary',
    description: 'Main data source, searched by default',
    color: 'success',
  },
  secondary: {
    label: 'Secondary',
    description: 'Supplementary data, searched when relevant',
    color: 'default',
  },
};

/**
 * Display field roles
 */
export type DisplayFieldRole = 'title' | 'subtitle' | 'description' | 'image' | 'price' | 'badge' | 'secondary' | 'link';

export const DISPLAY_FIELD_ROLES: DisplayFieldRole[] = ['title', 'subtitle', 'description', 'image', 'price', 'badge', 'secondary', 'link'];

export const DISPLAY_FIELD_ROLE_INFO: Record<DisplayFieldRole, { label: string; description: string; icon: string }> = {
  title: {
    label: 'Title',
    description: 'Primary title/name displayed prominently',
    icon: 'Type',
  },
  subtitle: {
    label: 'Subtitle',
    description: 'Secondary title or tagline',
    icon: 'Text',
  },
  description: {
    label: 'Description',
    description: 'Longer text description (may be truncated)',
    icon: 'AlignLeft',
  },
  image: {
    label: 'Image',
    description: 'Product/item image URL',
    icon: 'Image',
  },
  price: {
    label: 'Price',
    description: 'Price value (formatted as currency)',
    icon: 'DollarSign',
  },
  badge: {
    label: 'Badge',
    description: 'Small badge/tag (e.g., brand, category)',
    icon: 'Tag',
  },
  secondary: {
    label: 'Secondary',
    description: 'Additional info shown in details',
    icon: 'Info',
  },
  link: {
    label: 'Link',
    description: 'URL for item detail page (internal or external)',
    icon: 'Link',
  },
};

// ============================================================================
// LIST RESPONSE TYPE
// ============================================================================

/**
 * Response type for listing search experiences
 */
export interface SearchExperienceListResponse {
  items: SearchExperienceSummary[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}
