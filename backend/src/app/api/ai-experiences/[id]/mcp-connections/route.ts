import { NextRequest } from 'next/server';

import { forBuiltInChange } from '@/features/access/built-in';
import { forExperienceMcpAttachments } from '@/features/access/picker-reads';
import { handleListAttachments, handleAttach } from '@/features/mcp-connection/mcp-connection.api.handlers';

export const GET = forExperienceMcpAttachments(async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleListAttachments(request, context);
});

export const POST = forBuiltInChange('ai-experience', 'ai-experiences:edit', async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleAttach(request, context);
});
