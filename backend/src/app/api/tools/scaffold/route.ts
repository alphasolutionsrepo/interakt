import { NextRequest } from 'next/server';

import { checksBuiltInInHandler } from '@/features/access/built-in';
import { withPermission } from '@/features/access/route-guard';
import { handleScaffoldTools } from '@/features/tools/tools.api.handlers';

// Tools from the docs data source: handleScaffoldTools refuses a non-Admin
export const POST = checksBuiltInInHandler(withPermission('tools:edit', async function POST(request: NextRequest) {
  return handleScaffoldTools(request);
}));
