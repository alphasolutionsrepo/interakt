// app/analytics/_lib/insights-api.ts

/**
 * Requests behind the analytics settings and What needs attention: the insights refresh
 * schedule, a refresh started now, and clearing recorded data.
 */

import { jobsApi, type ScheduleRecord } from '@/app/jobs/_lib/api-client';
import { ApiError, handleApiResponse, toApiError } from '@/shared/api/api-error';

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

/**
 * Compute insights now and wait until it finishes, reading the progress stream to its
 * end. A refresh already running (409) is left to the status poll; any other refusal
 * throws an ApiError.
 */
export async function refreshInsights(experienceId: string | undefined): Promise<void> {
  const res = await fetch('/api/analytics/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ triggeredBy: 'admin', experienceId }),
  });
  if (res.status === 409) return;
  if (!res.ok) throw await toApiError(res, 'Failed to refresh insights');

  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (decoder.decode(value).includes('[DONE]')) break;
  }
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
