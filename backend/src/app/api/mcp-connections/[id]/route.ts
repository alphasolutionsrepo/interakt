import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleGet, handleUpdate, handleDelete } from '@/features/mcp-connection/mcp-connection.api.handlers';

export const GET = withPermission('tools:view', async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleGet(request, context);
});

export const PATCH = withPermission('tools:edit', async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleUpdate(request, context);
});

export const DELETE = withPermission('tools:edit', async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleDelete(request, context);
});
