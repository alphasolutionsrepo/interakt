// app/api/search-indexes/[id]/knowledge/route.ts

/**
 * Knowledge API Routes
 * GET  /api/search-indexes/:id/knowledge - List knowledge entries
 * POST /api/search-indexes/:id/knowledge - Create knowledge entry (or bulk)
 */

import { NextRequest } from 'next/server';

import { forBuiltInChange } from '@/features/access/built-in';
import { withPermission } from '@/features/access/route-guard';
import {
  handleListKnowledgeEntries,
  handleCreateKnowledgeEntry,
} from '@/features/domain-knowledge';

export const GET = withPermission('prompts:view', async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleListKnowledgeEntries(request, context);
});

export const POST = forBuiltInChange('search-index', 'prompts:edit', async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleCreateKnowledgeEntry(request, context);
});
