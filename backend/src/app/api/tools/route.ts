import { NextRequest } from 'next/server';
import { handleListTools, handleCreateTool } from '@/features/tools/tools.api.handlers';

export async function GET(request: NextRequest) {
  return handleListTools(request);
}

export async function POST(request: NextRequest) {
  return handleCreateTool(request);
}
