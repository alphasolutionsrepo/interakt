import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleUploadDocument } from '@/features/knowledge-base/knowledge-base.api.handlers';

export const POST = withPermission('prompts:edit', async function POST(request: NextRequest) {
  return handleUploadDocument(request);
});
