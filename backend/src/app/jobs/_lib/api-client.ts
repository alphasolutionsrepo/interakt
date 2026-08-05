// app/jobs/_lib/api-client.ts

export type JobState =
  | 'created'
  | 'retry'
  | 'active'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type JobAction = 'cancel' | 'resume' | 'retry' | 'delete';

export interface JobRecord {
  id: string;
  queue: string;
  state: JobState;
  data: unknown;
  output: unknown;
  retryCount: number;
  retryLimit: number;
  createdOn: string;
  startedOn: string | null;
  completedOn: string | null;
}

export interface QueueSummary {
  name: string;
  queuedCount: number;
  activeCount: number;
  deferredCount: number;
  totalCount: number;
}

export interface ScheduleRecord {
  name: string;
  cron: string;
  timezone: string;
  data: unknown;
}

export interface JobTypeInfo {
  queue: string;
  label: string;
  description: string;
  payloadExample: Record<string, unknown>;
}

export interface ListJobsParams {
  queue?: string;
  state?: JobState;
  limit?: number;
}

async function unwrap<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json.error || json.message || 'Request failed');
  }
  return json.data ?? json;
}

export const jobsApi = {
  async listJobs(params: ListJobsParams = {}): Promise<JobRecord[]> {
    const qs = new URLSearchParams();
    if (params.queue) qs.set('queue', params.queue);
    if (params.state) qs.set('state', params.state);
    if (params.limit) qs.set('limit', String(params.limit));
    const suffix = qs.toString() ? `?${qs}` : '';
    return unwrap<JobRecord[]>(await fetch(`/api/jobs${suffix}`));
  },

  async getQueues(): Promise<QueueSummary[]> {
    return unwrap<QueueSummary[]>(await fetch('/api/jobs/queues'));
  },

  async getSchedules(): Promise<ScheduleRecord[]> {
    return unwrap<ScheduleRecord[]>(await fetch('/api/jobs/schedules'));
  },

  async getJobTypes(): Promise<JobTypeInfo[]> {
    return unwrap<JobTypeInfo[]>(await fetch('/api/jobs/types'));
  },

  async setSchedule(queue: string, cron: string, timezone?: string): Promise<void> {
    await unwrap(
      await fetch('/api/jobs/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queue, cron, timezone }),
      })
    );
  },

  async removeSchedule(queue: string): Promise<void> {
    await unwrap(
      await fetch(`/api/jobs/schedules/${encodeURIComponent(queue)}`, {
        method: 'DELETE',
      })
    );
  },

  async enqueue(queue: string, data: Record<string, unknown> = {}): Promise<{ id: string | null }> {
    return unwrap<{ id: string | null }>(
      await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queue, data }),
      })
    );
  },

  async applyAction(queue: string, id: string, action: JobAction): Promise<void> {
    await unwrap(
      await fetch(`/api/jobs/${encodeURIComponent(queue)}/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
    );
  },
};
