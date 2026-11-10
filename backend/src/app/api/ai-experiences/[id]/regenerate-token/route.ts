import { NextRequest } from 'next/server';

import { forBuiltInChange } from '@/features/access/built-in';

import { handleRegenerateAccessToken } from '@/features/ai-experience/ai-experience.api.handlers';

export const POST = forBuiltInChange('ai-experience', 'ai-experiences:edit', async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleRegenerateAccessToken(request, context);
});
