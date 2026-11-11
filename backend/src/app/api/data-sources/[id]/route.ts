import { NextRequest } from 'next/server';

import { forBuiltInChange } from '@/features/access/built-in';
import { forDataSourcePickers } from '@/features/access/picker-reads';
import {
  handleGetDataSource,
  handleUpdateDataSource,
  handleDeleteDataSource,
} from '@/features/data-source/data-source.api.handlers';

export const GET = forDataSourcePickers(async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleGetDataSource(request, context);
});

export const PUT = forBuiltInChange('data-source', 'data-sources:edit', async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleUpdateDataSource(request, context);
});

export const DELETE = forBuiltInChange('data-source', 'data-sources:edit', async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleDeleteDataSource(request, context);
});
