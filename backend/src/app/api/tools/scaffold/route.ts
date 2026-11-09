import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleScaffoldTools } from '@/features/tools/tools.api.handlers';

export const POST = withPermission('tools:edit', async function POST(request: NextRequest) {
  return handleScaffoldTools(request);
});
