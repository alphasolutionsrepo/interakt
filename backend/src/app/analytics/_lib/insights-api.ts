// app/analytics/_lib/insights-api.ts

/**
 * Requests behind the analytics settings and What needs attention: the insights refresh
 * schedule, a refresh started now, and clearing recorded data.
 */

import { jobsApi, type ScheduleRecord } from '@/app/jobs/_lib/api-client';
import { ApiError, apiErrorFrom, handleApiResponse, toApiError, type ApiErrorBody } from '@/shared/api/api-error';
import { streamEvents } from '@/shared/api/stream-events';

/** The background job queue that refreshes insights */
export const INSIGHTS_QUEUE = 'refresh-insights';

/** The insights refresh schedule: null when there is none, 'forbidden' when the viewer may not see schedules (admin only) */
export async function loadInsightsSchedule(): Promise<ScheduleRecord | null | 'forbidden'> {
  try {
    return (await jobsApi.getSchedules()).find((s) => s.name === INSIGHTS_QUEUE) ?? null;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return 'forbidden';
    throw error;
  }
}

/** What the refresh stream sends: progress, then how the run ended, or why it stopped */
type ProcessEvent =
  | { type: 'status'; message: string }
  // A run that failed is sent as an error event
  | { type: 'complete' }
  | ({ type: 'error' } & ApiErrorBody);

const REFRESH_FAILED = 'Failed to refresh insights';

/**
 * Compute insights now and wait until it finishes, reading the progress stream to its
 * end. A refresh already running (409) is left to the status poll. A refusal, a run
 * that failed, or a stream that ends before the run does throws an ApiError.
 */
export async function refreshInsights(experienceId: string | undefined): Promise<void> {
  const res = await fetch('/api/analytics/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ triggeredBy: 'admin', experienceId }),
  });
  if (res.status === 409) return;
  if (!res.ok) throw await toApiError(res, REFRESH_FAILED);

  for await (const event of streamEvents<ProcessEvent>(res)) {
    if (event.type === 'error') throw apiErrorFrom(event, 500, REFRESH_FAILED);
    if (event.type === 'complete') return;
  }
  throw new ApiError('The refresh stopped before it finished', 502);
}

/** Delete recorded analytics for one experience, or for every experience */
export async function clearAnalyticsData(experienceId: string | undefined): Promise<void> {
  await handleApiResponse(
    await fetch('/api/analytics/data', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'all', experienceId }),
    }),
    'Failed to clear analytics data',
  );
}
