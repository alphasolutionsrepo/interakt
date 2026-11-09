import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleTest } from '@/features/mcp-connection/mcp-connection.api.handlers';

export const POST = withPermission('playground:use', async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleTest(request, context);
});
