import { NextRequest } from 'next/server';
import { handleCheckSlug } from '@/features/ai-experience/ai-experience.api.handlers';

export async function GET(request: NextRequest) {
  return handleCheckSlug(request);
}
