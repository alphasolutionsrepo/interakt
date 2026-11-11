import { NextRequest } from 'next/server';

import { checksBuiltInInHandler } from '@/features/access/built-in';
import { withPermission } from '@/features/access/route-guard';
import { handleListTools, handleCreateTool } from '@/features/tools/tools.api.handlers';

export const GET = withPermission('tools:view', async function GET(request: NextRequest) {
  return handleListTools(request);
});

// A tool on the docs data source: handleCreateTool refuses a non-Admin
export const POST = checksBuiltInInHandler(withPermission('tools:edit', async function POST(request: NextRequest) {
  return handleCreateTool(request);
}));
