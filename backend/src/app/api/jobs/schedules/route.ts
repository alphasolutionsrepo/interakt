// app/api/jobs/schedules/route.ts

import { NextRequest } from 'next/server';

import { handleGetSchedules, handleSetSchedule } from '@/features/jobs/jobs.api.handlers';

export async function GET() {
  return handleGetSchedules();
}

export async function POST(request: NextRequest) {
  return handleSetSchedule(request);
}
