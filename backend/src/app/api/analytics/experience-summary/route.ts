// app/api/analytics/experience-summary/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getExperienceSummaries } from '@/features/analytics/analytics-experience-summary.service';
import type { TimeRange } from '@/features/analytics/analytics-query.service';
import { PeriodError, readRequestedPeriod } from '@/features/analytics/analytics-period';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    // An explicit period (from/to, as the analytics pages send) wins over the preset
    const period = readRequestedPeriod(searchParams);
    const timeRange = period ? 'custom' : ((searchParams.get('timeRange') || '7d') as TimeRange);

    const summaries = await getExperienceSummaries(timeRange, period);

    return NextResponse.json({ success: true, data: summaries });
  } catch (error) {
    if (error instanceof PeriodError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
