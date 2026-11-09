import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import {
  handleGetDataSource,
  handleUpdateDataSource,
  handleDeleteDataSource,
} from '@/features/data-source/data-source.api.handlers';

export const GET = withPermission('data-sources:view', async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleGetDataSource(request, context);
});

export const PUT = withPermission('data-sources:edit', async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleUpdateDataSource(request, context);
});

export const DELETE = withPermission('data-sources:edit', async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleDeleteDataSource(request, context);
});
