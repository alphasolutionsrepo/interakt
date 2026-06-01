'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { PageHeader } from '@/shared/ui/custom/PageHeader';
import { Activity, RefreshCw, Trash2 } from 'lucide-react';
import { ExperienceSelector } from '../_components/ExperienceSelector';
import { useAnalyticsContext } from '../_lib/AnalyticsContext';
import { useQueryClient } from '@tanstack/react-query';
import type { TimeRange, SpanFilterOptions, SpanListItem } from './_lib/api-client';
import { useSpans, useSpanMetrics, useDeleteAllSpans } from './_lib/hooks/useTraces';
import { SpanMetricsBar } from './_components/SpanMetricsBar';
import { SpanFilters } from './_components/SpanFilters';
import { SpanList } from './_components/SpanList';
import { TurnTimeline } from './_components/TurnTimeline';

export default function TracesPage() {
  const queryClient = useQueryClient();
  const { experienceId } = useAnalyticsContext();

  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  // Always conversations mode (rootOnly: true) — no toggle
  const [filters, setFilters] = useState<SpanFilterOptions>({ rootOnly: true });
  const [selectedSpan, setSelectedSpan] = useState<SpanListItem | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const effectiveFilters = { ...filters, ...(experienceId ? { experienceId } : {}) };
  const { data: spansData, isLoading: spansLoading } = useSpans(timeRange, effectiveFilters);
  const { data: metrics, isLoading: metricsLoading } = useSpanMetrics(timeRange);
  const deleteAll = useDeleteAllSpans();

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['telemetry'] });
  }, [queryClient]);

  const handleSelectSpan = useCallback((span: SpanListItem) => {
    setSelectedSpan(span);
  }, []);

  const handleClose = useCallback(() => {
    setSelectedSpan(null);
  }, []);

  const handleDeleteAll = useCallback(() => {
    deleteAll.mutate(undefined, {
      onSuccess: () => {
        setDeleteDialogOpen(false);
        setSelectedSpan(null);
      },
    });
  }, [deleteAll]);

  const showDetail = !!selectedSpan;
  const total = spansData?.pagination.totalItems ?? 0;

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      {/* Header */}
      <PageHeader
        title="Conversations"
        description="Every chat turn — what the user said, what tools were called, what the AI replied"
        icon={Activity}
        iconBg="bg-violet-100"
        iconColor="text-violet-600"
        actions={
          <div className="flex items-center gap-2">
            <ExperienceSelector compact />
            <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
              <SelectTrigger size="sm" className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1h">Last 1h</SelectItem>
                <SelectItem value="24h">Last 24h</SelectItem>
                <SelectItem value="7d">Last 7d</SelectItem>
                <SelectItem value="30d">Last 30d</SelectItem>
                <SelectItem value="90d">Last 90d</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="mr-1.5 size-3.5" />
              Refresh
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:bg-destructive/10"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="mr-1.5 size-3.5" />
              Clear All
            </Button>
          </div>
        }
      />

      {/* Metrics bar */}
      <SpanMetricsBar metrics={metrics} isLoading={metricsLoading} />

      {/* Filters */}
      <SpanFilters filters={filters} onChange={setFilters} />

      <Separator />

      {/* Main content */}
      <div className="flex min-h-0 flex-1 gap-4">
        {/* Left: conversation list */}
        <Card className={showDetail ? 'flex w-full flex-col overflow-hidden lg:w-[38%]' : 'flex w-full flex-col overflow-hidden'}>
          <div className="flex items-center border-b px-4 py-2.5">
            <span className="text-sm font-medium text-muted-foreground">
              {total} conversation{total !== 1 ? 's' : ''}
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

      <ConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Clear All Conversations"
        description="This will permanently delete all recorded conversation traces. This cannot be undone."
        actionLabel="Clear All"
        onConfirm={handleDeleteAll}
        variant="destructive"
        loading={deleteAll.isPending}
      />
    </div>
  );
}
