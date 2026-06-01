import { NextRequest } from 'next/server';
import { handleRegenerateAccessToken } from '@/features/ai-experience/ai-experience.api.handlers';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleRegenerateAccessToken(request, context);
}
