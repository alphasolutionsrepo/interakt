import { NextRequest } from 'next/server';
import { handleCheckSlug } from '@/features/tools/tools.api.handlers';

export async function GET(request: NextRequest) {
  return handleCheckSlug(request);
}
