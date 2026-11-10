import { NextRequest } from 'next/server';

import { forBuiltInChange } from '@/features/access/built-in';
import { withPermission } from '@/features/access/route-guard';
import {
  handleGetTool,
  handleUpdateTool,
  handleDeleteTool,
} from '@/features/tools/tools.api.handlers';

export const GET = withPermission('tools:view', async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleGetTool(request, context);
});

export const PUT = forBuiltInChange('tool', 'tools:edit', async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleUpdateTool(request, context);
});

export const DELETE = forBuiltInChange('tool', 'tools:edit', async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleDeleteTool(request, context);
});
