// app/analytics/traces/_lib/hooks/useTraces.ts

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { tracesApi, type TimeRange, type SpanFilterOptions } from '../api-client';

export function useSpans(timeRange: TimeRange, filters?: SpanFilterOptions, limit = 100, offset = 0) {
  return useQuery({
    queryKey: ['telemetry', 'spans', timeRange, filters, limit, offset],
    queryFn: () => tracesApi.list(timeRange, filters, limit, offset),
    refetchInterval: 30000,
    staleTime: 15000,
  });
}

export function useSpanDetail(spanId: string | null) {
  return useQuery({
    queryKey: ['telemetry', 'spans', spanId],
    queryFn: () => tracesApi.getById(spanId!),
    enabled: !!spanId,
    staleTime: 60000,
  });
}

export function useTraceSpans(traceId: string | null) {
  return useQuery({
    queryKey: ['telemetry', 'trace', traceId],
    queryFn: () => tracesApi.getTraceSpans(traceId!),
    enabled: !!traceId,
    staleTime: 60000,
  });
}

export function useSpanMetrics(timeRange: TimeRange) {
  return useQuery({
    queryKey: ['telemetry', 'metrics', timeRange],
    queryFn: () => tracesApi.getMetrics(timeRange),
    refetchInterval: 60000,
    staleTime: 30000,
  });
}

export function useDeleteSpan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (spanId: string) => tracesApi.deleteSpan(spanId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telemetry'] });
      toast.success('Span deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete span');
    },
  });
}

export function useDeleteAllSpans() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => tracesApi.deleteAll(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['telemetry'] });
      toast.success(`Deleted ${data.count} span${data.count !== 1 ? 's' : ''}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete spans');
    },
  });
}
