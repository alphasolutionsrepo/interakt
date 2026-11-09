import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleListDataSources, handleCreateDataSource } from '@/features/data-source/data-source.api.handlers';

export const GET = withPermission('data-sources:view', async function GET(request: NextRequest) {
  return handleListDataSources(request);
});

export const POST = withPermission('data-sources:edit', async function POST(request: NextRequest) {
  return handleCreateDataSource(request);
});
