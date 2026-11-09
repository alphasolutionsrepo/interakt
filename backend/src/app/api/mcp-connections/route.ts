import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleList, handleCreate } from '@/features/mcp-connection/mcp-connection.api.handlers';

export const GET = withPermission('tools:view', async function GET(request: NextRequest) {
  return handleList(request);
});

export const POST = withPermission('tools:edit', async function POST(request: NextRequest) {
  return handleCreate(request);
});
