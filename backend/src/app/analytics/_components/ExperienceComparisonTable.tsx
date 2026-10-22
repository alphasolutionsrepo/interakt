// app/analytics/_components/ExperienceComparisonTable.tsx

'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/components/card';
import { Badge } from '@/shared/ui/components/badge';
import { Skeleton } from '@/shared/ui/components/skeleton';
import { Bot, Search, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAnalyticsContext } from '../_lib/AnalyticsContext';
import type { TimeRange } from '../_lib/hooks/useAnalytics';

// ============================================================================
// TYPES
// ============================================================================

interface ExperienceSummary {
  id: string;
  name: string;
  type: 'ai' | 'search';
  /** Conversations for AI experiences, searches for search experiences */
  volume: number;
  deleted: boolean;
  successRate: number;
  zeroResultRate: number;
  avgLatencyMs: number;
}

// ============================================================================
// HOOK
// ============================================================================

function useExperienceSummaries(timeRange: TimeRange) {
  return useQuery({
    queryKey: ['analytics', 'experience-summary', timeRange],
    queryFn: async (): Promise<ExperienceSummary[]> => {
      const res = await fetch(`/api/analytics/experience-summary?timeRange=${timeRange}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      return json.data || [];
    },
    staleTime: 30000,
    refetchInterval: 60000,
  });
}

// ============================================================================
// HELPERS
// ============================================================================

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`;
}

function formatLatency(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function getRateColor(rate: number, isGoodWhenHigh: boolean): string {
  const isGood = isGoodWhenHigh ? rate >= 0.8 : rate <= 0.1;
  const isOk = isGoodWhenHigh ? rate >= 0.6 : rate <= 0.2;

  if (isGood) return 'text-green-600 dark:text-green-400';
  if (isOk) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

// ============================================================================
// COMPONENT
// ============================================================================

interface ExperienceComparisonTableProps {
  timeRange: TimeRange;
}

export function ExperienceComparisonTable({ timeRange }: ExperienceComparisonTableProps) {
  const { setExperience } = useAnalyticsContext();
  const { data: experiences = [], isLoading } = useExperienceSummaries(timeRange);

  if (isLoading) {
    return (
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Experiences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (experiences.length === 0) {
    return null;
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Experiences</CardTitle>
        <p className="text-xs text-muted-foreground">Select an experience to see its detailed analytics</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {/* Header */}
          <div className="grid grid-cols-[1fr_96px_80px_80px_80px] gap-2 px-3 py-1.5 text-xs text-muted-foreground font-medium">
            <span>Experience</span>
            <span className="text-right" title="Conversations for AI experiences, searches for search experiences">Volume</span>
            <span className="text-right" title="AI: conversation turns that completed successfully. Search: searches that returned results.">Success</span>
            <span className="text-right" title="Share of searches (including AI tool searches) that returned no results">Zero Results</span>
            <span className="text-right" title="AI: average time per conversation turn. Search: average search time.">Avg Time</span>
          </div>

          {/* Rows */}
          {experiences.map((exp) => (
            <button
              key={exp.id}
              onClick={() => setExperience(exp.id, exp.name, exp.type)}
              disabled={exp.deleted}
              title={exp.deleted ? `This experience was deleted (ID ${exp.id}). Its historical data is still included in the totals.` : undefined}
              className="w-full grid grid-cols-[1fr_96px_80px_80px_80px] gap-2 items-center px-3 py-2.5 rounded-xl enabled:hover:bg-muted/50 disabled:opacity-60 transition-colors text-left group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-lg',
                  exp.type === 'ai' ? 'bg-violet-100 dark:bg-violet-900' : 'bg-blue-100 dark:bg-blue-900'
                )}>
                  {exp.type === 'ai' ? (
                    <Bot className="size-3.5 text-violet-600 dark:text-violet-400" />
                  ) : (
                    <Search className="size-3.5 text-blue-600 dark:text-blue-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <span className="text-sm font-medium truncate block">
                    {exp.deleted ? `Deleted experience (${exp.id.slice(0, 8)})` : exp.name}
                  </span>
                  <Badge variant="outline" className="text-[10px] px-1 py-0 mt-0.5">
                    {exp.type === 'ai' ? 'AI' : 'Search'}
                  </Badge>
                </div>
                {!exp.deleted && (
                  <ArrowRight className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-auto" />
                )}
              </div>
              <span className="text-sm text-right font-medium">
                {exp.volume.toLocaleString()}
                <span className="block text-[10px] font-normal text-muted-foreground">
                  {exp.type === 'ai' ? (exp.volume === 1 ? 'conversation' : 'conversations') : (exp.volume === 1 ? 'search' : 'searches')}
                </span>
              </span>
              <span className={cn('text-sm text-right font-medium', getRateColor(exp.successRate, true))}>
                {formatRate(exp.successRate)}
              </span>
              <span className={cn('text-sm text-right font-medium', getRateColor(exp.zeroResultRate, false))}>
                {formatRate(exp.zeroResultRate)}
              </span>
              <span className="text-sm text-right text-muted-foreground">
                {formatLatency(exp.avgLatencyMs)}
              </span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
