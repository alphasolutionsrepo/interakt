// app/analytics/traces/_lib/hooks/useTraces.ts

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { tracesApi, type SpanFilterOptions } from '../api-client';
import { periodKey, type Period } from '../../../_lib/period';

export function useSpans(period: Period, filters?: SpanFilterOptions, limit = 100, offset = 0) {
  return useQuery({
    queryKey: ['telemetry', 'spans', periodKey(period), filters, limit, offset],
    queryFn: () => tracesApi.list(period, filters, limit, offset),
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

export function useSpanMetrics(period: Period, experienceId?: string) {
  return useQuery({
    queryKey: ['telemetry', 'metrics', periodKey(period), experienceId],
    queryFn: () => tracesApi.getMetrics(period, experienceId),
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
    meta: { label: 'Delete span' },
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
    meta: { label: 'Delete spans' },
  });
}
