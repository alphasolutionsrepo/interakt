// app/api/v1/summarize/route.ts

/**
 * Public AI Summary API Route (v1)
 *
 * This is the PUBLIC API endpoint for AI-powered summarization.
 * Authentication is via access token in X-Access-Token header.
 *
 * POST /api/v1/summarize - Generate AI summary of search results (streaming)
 * OPTIONS /api/v1/summarize - CORS preflight
 */

import { NextRequest } from 'next/server';
import { handleSummarize } from '@/features/chat';

export async function POST(request: NextRequest) {
  return handleSummarize(request);
}

export async function OPTIONS(request: NextRequest) {
  return handleSummarize(request);
}
