import { NextRequest } from 'next/server';
import { handleSync } from '@/features/mcp-connection/mcp-connection.api.handlers';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleSync(request, context);
}
