// app/api/v1/autocomplete/route.ts

/**
 * Public Autocomplete API Route (v1)
 *
 * This is the PUBLIC API endpoint for external clients (React apps, etc.)
 * Authentication is via access token in X-Access-Token header.
 *
 * POST /api/v1/autocomplete - Get autocomplete suggestions
 * OPTIONS /api/v1/autocomplete - CORS preflight
 *
 * Request body:
 * {
 *   "query": "partial search text",
 *   "indexId": "optional-uuid-to-limit-to-specific-index",
 *   "maxSuggestions": 8 // optional, defaults to experience config
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "suggestions": [
 *       {
 *         "text": "suggested text",
 *         "score": 0.95,
 *         "field": "title",
 *         "indexId": "uuid",
 *         "indexName": "Products",
 *         "highlight": "<mark>sug</mark>gested text"
 *       }
 *     ],
 *     "query": "sug",
 *     "took": 15
 *   }
 * }
 */

import { NextRequest } from 'next/server';
import { handleAutocomplete } from '@/features/search-experience/search-experience.api.handlers';

export async function POST(request: NextRequest) {
  return handleAutocomplete(request);
}

export async function OPTIONS(request: NextRequest) {
  return handleAutocomplete(request);
}
