import { NextRequest } from 'next/server';
import { handleListAttachments, handleAttach } from '@/features/mcp-connection/mcp-connection.api.handlers';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleListAttachments(request, context);
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleAttach(request, context);
}
