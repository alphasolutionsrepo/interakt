// app/api/analytics/experience-summary/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getExperienceSummaries } from '@/features/analytics/analytics-experience-summary.service';
import type { TimeRange } from '@/features/analytics/analytics-query.service';

export async function GET(request: NextRequest) {
  try {
    const timeRange = (request.nextUrl.searchParams.get('timeRange') || '7d') as TimeRange;

    const summaries = await getExperienceSummaries(timeRange);

    return NextResponse.json({ success: true, data: summaries });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
