import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleSync } from '@/features/mcp-connection/mcp-connection.api.handlers';

export const POST = withPermission('tools:edit', async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleSync(request, context);
});
