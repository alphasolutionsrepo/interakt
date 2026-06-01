import { NextRequest } from 'next/server';
import { handleCheckSlug } from '@/features/data-source/data-source.api.handlers';

export async function GET(request: NextRequest) {
  return handleCheckSlug(request);
}
