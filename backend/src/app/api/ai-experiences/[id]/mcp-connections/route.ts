import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleListAttachments, handleAttach } from '@/features/mcp-connection/mcp-connection.api.handlers';

export const GET = withPermission('ai-experiences:view', async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleListAttachments(request, context);
});

export const POST = withPermission('ai-experiences:edit', async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleAttach(request, context);
});
