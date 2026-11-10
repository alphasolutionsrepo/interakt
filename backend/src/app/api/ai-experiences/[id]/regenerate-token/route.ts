import { NextRequest } from 'next/server';

import { forExperienceChange } from '@/features/access/built-in-experiences';
import { handleRegenerateAccessToken } from '@/features/ai-experience/ai-experience.api.handlers';

export const POST = forExperienceChange('ai', async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleRegenerateAccessToken(request, context);
});
