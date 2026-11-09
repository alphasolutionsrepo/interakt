import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleCheckSlug } from '@/features/data-source/data-source.api.handlers';

export const GET = withPermission('data-sources:view', async function GET(request: NextRequest) {
  return handleCheckSlug(request);
});
