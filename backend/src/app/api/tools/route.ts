import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleListTools, handleCreateTool } from '@/features/tools/tools.api.handlers';

export const GET = withPermission('tools:view', async function GET(request: NextRequest) {
  return handleListTools(request);
});

export const POST = withPermission('tools:edit', async function POST(request: NextRequest) {
  return handleCreateTool(request);
});
