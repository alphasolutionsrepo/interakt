import { NextRequest } from 'next/server';
import { handleGetLookupFields } from '@/features/tools/tools.api.handlers';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleGetLookupFields(request, context);
}
