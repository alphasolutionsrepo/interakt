import { SearchResponse, SearchFacet, SearchResult } from "../types"

export interface SearchApiOptions {
  searchUrl?: string;
  searchConfigId?: string;
  enableFacets?: boolean;
  page?: number;
  limit?: number;
}

/**
 * Perform search API call using the dropin search API
 */
export async function performSearch(
  query: string, 
  facetSelections: Record<string, string[]> = {},
  options: SearchApiOptions = {}
): Promise<SearchResponse | null> {
  if (!query.trim()) return null;

  try {
    const {
      searchUrl = 'https://admin.interakt.app',
      searchConfigId = 'fashion-catalog-search',
      page = 1,
      limit = 20
    } = options;
    
    const offset = (page - 1) * limit;
    
    const requestBody = {
      query: query.trim(),
      limit,
      offset,
      searchType: 'search',
      searchConfigId,
      enableFacets: options.enableFacets !== false,
      facetSelections: Object.keys(facetSelections).length > 0 ? facetSelections : undefined
    };

    console.log('🔍 Performing search with:', requestBody);

    const response = await fetch(`${searchUrl}/api/dropin-search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Id': 'demo-session-' + Date.now(),
        'X-User-Id': 'demo-user',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Search failed: ${response.status} ${response.statusText} - ${errorData.message || 'Unknown error'}`);
    }

    const data = await response.json();
    console.log('✅ Search response:', data);
    return data;
  } catch (error) {
    console.error('❌ Search API error:', error);
    throw error;
  }
}

/**
 * Convert search response to component-friendly format
 * The API now returns formattedResults with the proper structure
 */
export function transformSearchResults(searchResponse: SearchResponse) {
  return {
    results: searchResponse.formattedResults || [],
    facets: searchResponse.facets || {},
    total: searchResponse.total || 0,
    duration: searchResponse.metadata?.executionTimeMs || 0,
    pagination: searchResponse.pagination
  };
}