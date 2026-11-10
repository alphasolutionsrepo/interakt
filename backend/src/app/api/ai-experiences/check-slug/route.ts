import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleCheckSlug } from '@/features/ai-experience/ai-experience.api.handlers';

export const GET = withPermission('ai-experiences:view', async function GET(request: NextRequest) {
  return handleCheckSlug(request);
});
