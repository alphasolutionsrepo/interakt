// app/api/jobs/[queue]/[id]/route.ts

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import {
  handleGetJob,
  handleJobAction,
} from '@/features/jobs/jobs.api.handlers';

export const GET = withPermission('settings:view', async function GET(
  request: NextRequest,
  context: { params: Promise<{ queue: string; id: string }> }
) {
  const { queue, id } = await context.params;
  return handleGetJob(queue, id);
});

export const POST = withPermission('jobs:run', async function POST(
  request: NextRequest,
  context: { params: Promise<{ queue: string; id: string }> }
) {
  const { queue, id } = await context.params;
  return handleJobAction(queue, id, request);
});
