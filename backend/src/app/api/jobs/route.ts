// app/api/jobs/route.ts

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import {
  handleListJobs,
  handleEnqueueJob,
} from '@/features/jobs/jobs.api.handlers';

export const GET = withPermission('settings:view', async function GET(request: NextRequest) {
  return handleListJobs(request);
});

export const POST = withPermission('jobs:run', async function POST(request: NextRequest) {
  return handleEnqueueJob(request);
});
