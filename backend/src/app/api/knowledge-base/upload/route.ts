import { NextRequest } from 'next/server';

import { checksBuiltInInHandler } from '@/features/access/built-in';
import { withPermission } from '@/features/access/route-guard';
import { handleUploadDocument } from '@/features/knowledge-base/knowledge-base.api.handlers';

// Into the docs data source: handleUploadDocument refuses a non-Admin
export const POST = checksBuiltInInHandler(withPermission('prompts:edit', async function POST(request: NextRequest) {
  return handleUploadDocument(request);
}));
