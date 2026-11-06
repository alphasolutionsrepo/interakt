// app/api/analytics/data/route.ts

/**
 * Analytics Data Management API
 *
 * DELETE - Clear analytics data by scope
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  clearAnalyticsData,
  type CleanupScope,
} from '@/features/analytics/analytics-data-management.service';
import { readJsonBody } from '@/shared/api/read-json-body';
import { apiResponse } from '@/shared/api/response';

const VALID_SCOPES: CleanupScope[] = ['all', 'insights', 'spans', 'events', 'sessions'];

export async function DELETE(request: NextRequest) {
  try {
    // A body that can't be read is refused: read as {}, its scope would be all
    const body = await readJsonBody(request);
    const { scope = 'all', experienceId } = body as {
      scope?: string;
      experienceId?: string;
    };

    if (!VALID_SCOPES.includes(scope as CleanupScope)) {
      return apiResponse.badRequest(`Invalid scope: ${scope}. Must be one of: ${VALID_SCOPES.join(', ')}`);
    }

    const result = await clearAnalyticsData({
      scope: scope as CleanupScope,
      experienceId,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return apiResponse.error(error, 500, { operation: 'clearAnalyticsData' });
  }
}
