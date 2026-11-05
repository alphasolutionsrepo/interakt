// app/api/analytics/experience-summary/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getExperienceSummaries } from '@/features/analytics/analytics-experience-summary.service';
import type { TimeRange } from '@/features/analytics/analytics-query.service';
import { PeriodError, readRequestedPeriod } from '@/features/analytics/analytics-period';
import { apiResponse } from '@/shared/api/response';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    // An explicit period (from/to, as the analytics pages send) wins over the preset
    const period = readRequestedPeriod(searchParams);
    const timeRange = period ? 'custom' : ((searchParams.get('timeRange') || '7d') as TimeRange);

    const summaries = await getExperienceSummaries(timeRange, period);

    return NextResponse.json({ success: true, data: summaries });
  } catch (error) {
    // The period the caller sent is wrong: its message says how
    if (error instanceof PeriodError) return apiResponse.badRequest(error.message);
    return apiResponse.error(error, 500, { operation: 'getExperienceSummaries' });
  }
}
