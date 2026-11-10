// app/api/jobs/schedules/route.ts

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleGetSchedules, handleSetSchedule } from '@/features/jobs/jobs.api.handlers';

export const GET = withPermission('settings:view', async function GET() {
  return handleGetSchedules();
});

export const POST = withPermission('jobs:run', async function POST(request: NextRequest) {
  return handleSetSchedule(request);
});
