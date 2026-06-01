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
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('api-analytics-data');

const VALID_SCOPES: CleanupScope[] = ['all', 'insights', 'spans', 'events', 'sessions'];

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { scope = 'all', experienceId } = body as {
      scope?: string;
      experienceId?: string;
    };

    if (!VALID_SCOPES.includes(scope as CleanupScope)) {
      return NextResponse.json(
        { success: false, error: `Invalid scope: ${scope}. Must be one of: ${VALID_SCOPES.join(', ')}` },
        { status: 400 }
      );
    }

    const result = await clearAnalyticsData({
      scope: scope as CleanupScope,
      experienceId,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    logger.error('Failed to clear analytics data', { error });
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
