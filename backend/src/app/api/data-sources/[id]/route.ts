import { NextRequest } from 'next/server';
import {
  handleGetDataSource,
  handleUpdateDataSource,
  handleDeleteDataSource,
} from '@/features/data-source/data-source.api.handlers';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleGetDataSource(request, context);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleUpdateDataSource(request, context);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleDeleteDataSource(request, context);
}
