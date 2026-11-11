import { NextRequest } from 'next/server';

import { forDataSourcePickers } from '@/features/access/picker-reads';
import { withPermission } from '@/features/access/route-guard';
import { handleListDataSources, handleCreateDataSource } from '@/features/data-source/data-source.api.handlers';

export const GET = forDataSourcePickers(async function GET(request: NextRequest) {
  return handleListDataSources(request);
});

export const POST = withPermission('data-sources:edit', async function POST(request: NextRequest) {
  return handleCreateDataSource(request);
});
