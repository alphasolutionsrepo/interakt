import { NextRequest } from 'next/server';
import { handleTest } from '@/features/mcp-connection/mcp-connection.api.handlers';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleTest(request, context);
}
