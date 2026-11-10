// app/api/analytics/experience-summary/route.ts

import { NextRequest, NextResponse } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { getExperienceSummaries } from '@/features/analytics/analytics-experience-summary.service';
import { PeriodError, readRequestedPeriod } from '@/features/analytics/analytics-period';
import type { TimeRange } from '@/features/analytics/analytics-query.service';
import { apiResponse } from '@/shared/api/response';

/** The time ranges a caller can name; a custom one comes as from and to */
const PRESETS: TimeRange[] = ['1h', '24h', '7d', '30d', '90d'];

export const GET = withPermission('analytics:view', async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    // An explicit period (from/to, as the analytics pages send) wins over the preset
    const period = readRequestedPeriod(searchParams);
    const preset = searchParams.get('timeRange') || '7d';
    if (!period && !PRESETS.includes(preset as TimeRange)) {
      return apiResponse.badRequest(`timeRange must be one of ${PRESETS.join(', ')}, or send from and to`);
    }
    const timeRange = period ? 'custom' : (preset as TimeRange);

    const summaries = await getExperienceSummaries(timeRange, period);

    return NextResponse.json({ success: true, data: summaries });
  } catch (error) {
    // The period the caller sent is wrong: its message says how
    if (error instanceof PeriodError) return apiResponse.badRequest(error.message);
    return apiResponse.error(error, 500, { operation: 'getExperienceSummaries' });
  }
});
