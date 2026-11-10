import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleGetCapabilities } from '@/features/tools/tools.api.handlers';

export const GET = withPermission('tools:view', async function GET(request: NextRequest) {
  return handleGetCapabilities(request);
});
