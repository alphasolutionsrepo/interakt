import { NextRequest } from 'next/server';
import { handleList, handleCreate } from '@/features/mcp-connection/mcp-connection.api.handlers';

export async function GET(request: NextRequest) {
  return handleList(request);
}

export async function POST(request: NextRequest) {
  return handleCreate(request);
}
