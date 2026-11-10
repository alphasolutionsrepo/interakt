import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleListDocuments } from '@/features/knowledge-base/knowledge-base.api.handlers';

export const GET = withPermission('prompts:view', async function GET(request: NextRequest) {
  return handleListDocuments(request);
});
