'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useAnalyticsContext } from '../_lib/AnalyticsContext';
import type { SpanFilterOptions, SpanListItem } from './_lib/api-client';
import { useSpans, useSpanMetrics } from './_lib/hooks/useTraces';
import { SpanMetricsBar } from './_components/SpanMetricsBar';
import { SpanFilters } from './_components/SpanFilters';
import { SpanList } from './_components/SpanList';
import { TurnTimeline } from './_components/TurnTimeline';

/** Filters a link can open Traces with: ?status=ERROR, ?search=…, ?trace=<trace id> */
function filtersFromUrl(): SpanFilterOptions {
  const params = new URLSearchParams(window.location.search);
  const status = params.get('status');
  const search = params.get('search');
  const trace = params.get('trace');
  return {
    rootOnly: true,
    ...(trace && /^[0-9a-f]{32}$/.test(trace) ? { traceId: trace } : {}),
    ...(status === 'ERROR' || status === 'UNSET' ? { statusCode: status } : {}),
    ...(search ? { search } : {}),
  };
}

export default function TracesPage() {
  // Period and experience come from the analytics filter bar
  const { experienceId, period } = useAnalyticsContext();

  // Always conversations mode (rootOnly: true) — no toggle
  const [filters, setFilters] = useState<SpanFilterOptions>({ rootOnly: true });
  const [selectedSpan, setSelectedSpan] = useState<SpanListItem | null>(null);
  // The filter bar copies its search text on mount, so it remounts once the URL filters are in
  const [urlFiltersApplied, setUrlFiltersApplied] = useState(false);

  useEffect(() => {
    setFilters(filtersFromUrl());
    setUrlFiltersApplied(true);
  }, []);

  const effectiveFilters = { ...filters, ...(experienceId ? { experienceId } : {}) };
  const { data: spansData, isLoading: spansLoading } = useSpans(period, effectiveFilters);
  const { data: metrics, isLoading: metricsLoading } = useSpanMetrics(period, experienceId);

  // A link to one trace opens it straight away
  const linkedSpan = filters.traceId ? spansData?.spans[0] : undefined;
  useEffect(() => {
    if (linkedSpan) setSelectedSpan(linkedSpan);
  }, [linkedSpan]);

  const showAllTraces = useCallback(() => {
    setFilters(({ traceId: _omit, ...rest }) => rest);
    setSelectedSpan(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('trace');
    window.history.replaceState(null, '', url);
  }, []);


  const handleSelectSpan = useCallback((span: SpanListItem) => {
    setSelectedSpan(span);
  }, []);

  const handleClose = useCallback(() => {
    setSelectedSpan(null);
  }, []);

  const showDetail = !!selectedSpan;
  const total = spansData?.pagination.totalItems ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Metrics (clearing traces lives in Analytics settings) */}
      <SpanMetricsBar metrics={metrics} isLoading={metricsLoading} />

      {/* Filters, or the one trace a link opened */}
      {filters.traceId ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <span>
            Showing one trace <span className="font-mono text-xs text-muted-foreground">{filters.traceId}</span>, whenever it happened
          </span>
          <Button variant="ghost" size="sm" onClick={showAllTraces}>
            Show all traces
          </Button>
        </div>
      ) : (
        <SpanFilters key={urlFiltersApplied ? 'url' : 'initial'} filters={filters} onChange={setFilters} />
      )}

      <Separator />

      {/* Main content */}
      <div className="flex h-[calc(100vh-22rem)] min-h-[480px] gap-4">
        {/* Left: conversation list */}
        <Card className={showDetail ? 'flex w-full flex-col overflow-hidden lg:w-[38%]' : 'flex w-full flex-col overflow-hidden'}>
          <div className="flex items-center border-b px-4 py-2.5">
            <span className="text-sm font-medium text-muted-foreground">
              {total} {total === 1 ? 'turn' : 'turns'}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {spansLoading ? (
              <div className="space-y-px p-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg p-3">
                    <div className="size-2.5 rounded-full bg-muted animate-pulse" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 w-3/4 rounded bg-muted animate-pulse" />
                      <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
                    </div>
                    <div className="h-3 w-10 rounded bg-muted animate-pulse" />
                  </div>
                ))}
              </div>
            ) : (
              <SpanList
                spans={spansData?.spans ?? []}
                selectedSpanId={selectedSpan?.id ?? null}
                onSelectSpan={handleSelectSpan}
              />
            )}
          </div>
        </Card>

        {/* Right: narrative turn detail */}
        {showDetail && (
          <Card className="hidden lg:flex w-[62%] min-h-0 flex-col overflow-hidden">
            <TurnTimeline rootSpan={selectedSpan} onClose={handleClose} />
          </Card>
        )}
      </div>
    </div>
  );
}
