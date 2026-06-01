import { NextRequest } from 'next/server';
import { handleGet, handleUpdate, handleDelete } from '@/features/mcp-connection/mcp-connection.api.handlers';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleGet(request, context);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleUpdate(request, context);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleDelete(request, context);
}
