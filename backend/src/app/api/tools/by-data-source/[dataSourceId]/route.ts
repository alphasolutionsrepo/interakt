import { NextRequest } from 'next/server';
import { handleGetToolsByDataSource } from '@/features/tools/tools.api.handlers';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ dataSourceId: string }> }
) {
  return handleGetToolsByDataSource(request, context);
}
