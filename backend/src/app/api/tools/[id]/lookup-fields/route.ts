import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleGetLookupFields } from '@/features/tools/tools.api.handlers';

export const GET = withPermission('tools:view', async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleGetLookupFields(request, context);
});
