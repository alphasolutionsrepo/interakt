// app/jobs/_lib/hooks/useJobs.ts

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  jobsApi,
  type JobAction,
  type ListJobsParams,
} from '../api-client';

export const jobKeys = {
  all: ['jobs'] as const,
  list: (params?: ListJobsParams) => [...jobKeys.all, 'list', params] as const,
  queues: () => [...jobKeys.all, 'queues'] as const,
  schedules: () => [...jobKeys.all, 'schedules'] as const,
  types: () => [...jobKeys.all, 'types'] as const,
};

const QUERY_DEFAULTS = {
  retry: false as const,
  refetchOnWindowFocus: false,
  staleTime: 5000,
} as const;

export function useJobs(params?: ListJobsParams, refetchInterval = 5000) {
  return useQuery({
    ...QUERY_DEFAULTS,
    queryKey: jobKeys.list(params),
    queryFn: () => jobsApi.listJobs(params),
    refetchInterval,
  });
}

export function useQueues(refetchInterval = 5000) {
  return useQuery({
    ...QUERY_DEFAULTS,
    queryKey: jobKeys.queues(),
    queryFn: () => jobsApi.getQueues(),
    refetchInterval,
  });
}

export function useSchedules() {
  return useQuery({
    ...QUERY_DEFAULTS,
    queryKey: jobKeys.schedules(),
    queryFn: () => jobsApi.getSchedules(),
  });
}

export function useJobTypes() {
  return useQuery({
    ...QUERY_DEFAULTS,
    queryKey: jobKeys.types(),
    queryFn: () => jobsApi.getJobTypes(),
    staleTime: 60_000,
  });
}

/** Invalidate everything jobs-related after a mutation. */
function useInvalidateJobs() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: jobKeys.all });
}

export function useEnqueueJob() {
  const invalidate = useInvalidateJobs();
  return useMutation({
    mutationFn: ({ queue, data }: { queue: string; data?: Record<string, unknown> }) =>
      jobsApi.enqueue(queue, data),
    onSuccess: () => {
      toast.success('Job enqueued');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to enqueue job'),
  });
}

export function useSetSchedule() {
  const invalidate = useInvalidateJobs();
  return useMutation({
    mutationFn: ({ queue, cron, timezone }: { queue: string; cron: string; timezone?: string }) =>
      jobsApi.setSchedule(queue, cron, timezone),
    onSuccess: () => {
      toast.success('Schedule saved');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to save schedule'),
  });
}

export function useRemoveSchedule() {
  const invalidate = useInvalidateJobs();
  return useMutation({
    mutationFn: (queue: string) => jobsApi.removeSchedule(queue),
    onSuccess: () => {
      toast.success('Schedule removed');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to remove schedule'),
  });
}

const ACTION_VERB: Record<JobAction, string> = {
  cancel: 'cancelled',
  resume: 'resumed',
  retry: 'retried',
  delete: 'deleted',
};

export function useJobAction() {
  const invalidate = useInvalidateJobs();
  return useMutation({
    mutationFn: ({ queue, id, action }: { queue: string; id: string; action: JobAction }) =>
      jobsApi.applyAction(queue, id, action),
    onSuccess: (_data, { action }) => {
      toast.success(`Job ${ACTION_VERB[action]}`);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Action failed'),
  });
}
