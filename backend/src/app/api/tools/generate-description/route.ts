import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleGenerateDescription } from '@/features/tools/tools.api.handlers';

export const POST = withPermission('playground:use', async function POST(request: NextRequest) {
  return handleGenerateDescription(request);
});
