import { NextRequest } from 'next/server';
import {
  handleGetTool,
  handleUpdateTool,
  handleDeleteTool,
} from '@/features/tools/tools.api.handlers';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleGetTool(request, context);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleUpdateTool(request, context);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleDeleteTool(request, context);
}
