import { NextRequest } from 'next/server';
import { handleGetCapabilities } from '@/features/tools/tools.api.handlers';

export async function GET(request: NextRequest) {
  return handleGetCapabilities(request);
}
