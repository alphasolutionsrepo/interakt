import { NextRequest } from 'next/server';

import { forPickers } from '@/features/access/picker-reads';
import { withPermission } from '@/features/access/route-guard';
import { handleList, handleCreate } from '@/features/mcp-connection/mcp-connection.api.handlers';

export const GET = forPickers('tools', 'mcpConnections', async function GET(request: NextRequest) {
  return handleList(request);
});

export const POST = withPermission('tools:edit', async function POST(request: NextRequest) {
  return handleCreate(request);
});
