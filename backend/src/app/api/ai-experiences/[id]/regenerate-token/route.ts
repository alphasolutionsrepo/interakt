import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleRegenerateAccessToken } from '@/features/ai-experience/ai-experience.api.handlers';

export const POST = withPermission('ai-experiences:edit', async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleRegenerateAccessToken(request, context);
});
