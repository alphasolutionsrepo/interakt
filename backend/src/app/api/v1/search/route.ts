// app/api/v1/search/route.ts

/**
 * Public Search API Route (v1)
 *
 * This is the PUBLIC API endpoint for external clients (React apps, etc.)
 * Authentication is via access token in X-Access-Token header.
 *
 * POST /api/v1/search - Execute search query through Search Experience
 * OPTIONS /api/v1/search - CORS preflight
 *
 * Note: Internal/admin search APIs are at /api/search/index/[id] and /api/search/name/[name]
 * Those use session authentication and search directly on index IDs.
 */

import { NextRequest } from 'next/server';
import { handlePublicSearch } from '@/features/search-experience/search-experience.api.handlers';

export async function POST(request: NextRequest) {
  return handlePublicSearch(request);
}

export async function OPTIONS(request: NextRequest) {
  return handlePublicSearch(request);
}
