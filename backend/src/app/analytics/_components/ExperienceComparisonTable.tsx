// app/analytics/_components/ExperienceComparisonTable.tsx

'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Bot, CircleAlert, Search } from 'lucide-react';
import { useState } from 'react';

import { useAnalyticsContext } from '../_lib/AnalyticsContext';
import { periodKey, periodParams, type Period } from '../_lib/period';

import { formatCompact, formatMs, pluralize } from './viz';

import { cn } from '@/lib/utils';
import { Button } from '@/shared/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/components/card';
import { Skeleton } from '@/shared/ui/components/skeleton';

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

/** Rows shown before "Show all" */
const SHOWN = 8;

// ============================================================================
// HOOK
// ============================================================================

function useExperienceSummaries(period: Period) {
  return useQuery({
    queryKey: ['analytics', 'experience-summary', periodKey(period)],
    queryFn: async (): Promise<ExperienceSummary[]> => {
      // Resolved at fetch time, so each refresh covers up to now
      const res = await fetch(`/api/analytics/experience-summary?${new URLSearchParams(periodParams(period))}`);
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

type Health = 'ok' | 'warning' | 'critical';

/** Only problems get colour (and an icon); healthy values stay plain */
function healthOf(rate: number, goodWhenHigh: boolean): Health {
  if (goodWhenHigh ? rate >= 0.8 : rate <= 0.1) return 'ok';
  if (goodWhenHigh ? rate >= 0.6 : rate <= 0.2) return 'warning';
  return 'critical';
}

function Rate({ rate, goodWhenHigh, label }: { rate: number; goodWhenHigh: boolean; label: string }) {
  const health = healthOf(rate, goodWhenHigh);
  const Icon = health === 'critical' ? CircleAlert : AlertTriangle;
  return (
    <span className="inline-flex items-center justify-end gap-1 tabular-nums">
      {health !== 'ok' && (
        <Icon
          className={cn('size-3.5', health === 'critical' ? 'text-viz-critical' : 'text-viz-warning')}
          aria-label={health === 'critical' ? `${label}: needs attention` : `${label}: worth a look`}
        />
      )}
      {`${(rate * 100).toFixed(0)}%`}
    </span>
  );
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ExperienceComparisonTable() {
  const { setExperience, period } = useAnalyticsContext();
  const { data: experiences = [], isLoading } = useExperienceSummaries(period);
  const [showAll, setShowAll] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);

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

  const byVolume = [...experiences].sort((a, b) => b.volume - a.volume);
  const live = byVolume.filter((e) => !e.deleted);
  const deleted = byVolume.filter((e) => e.deleted);
  const rows = [...(showAll ? live : live.slice(0, SHOWN)), ...(showDeleted ? deleted : [])];

  return (
    <Card className="@container rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Experiences</CardTitle>
        <p className="text-xs text-muted-foreground">Busiest first. Select one to see its analytics.</p>
      </CardHeader>
      <CardContent className="space-y-1">
        {/* Header (wide only; narrow rows label their own figures) */}
        <div className="hidden gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground @lg:grid @lg:grid-cols-[minmax(0,1fr)_88px_72px_72px_64px]">
          <span>Experience</span>
          <span className="text-right" title="Conversations for AI experiences, searches for search experiences">Volume</span>
          <span className="text-right" title="AI: conversation turns that completed. Search: searches that returned results.">Succeeded</span>
          <span className="text-right" title="Share of searches (including AI tool searches) that returned no results">Found nothing</span>
          <span className="text-right" title="AI: average time per conversation turn. Search: average search time.">Avg time</span>
        </div>

        {rows.map((exp) => {
          const unit = exp.type === 'ai' ? 'conversation' : 'search';
          const volume = pluralize(exp.volume, unit, exp.type === 'ai' ? 'conversations' : 'searches');
          const name = exp.deleted ? `Deleted experience (${exp.id.slice(0, 8)})` : exp.name;
          return (
            <button
              key={exp.id}
              onClick={() => setExperience(exp.id, exp.name, exp.type)}
              disabled={exp.deleted}
              title={exp.deleted ? `This experience was deleted (ID ${exp.id}). Its data is still in the totals.` : exp.name}
              className="group grid w-full items-center gap-x-2 gap-y-1 rounded-xl px-3 py-2 text-left transition-colors enabled:hover:bg-muted/50 disabled:opacity-60 @lg:grid-cols-[minmax(0,1fr)_88px_72px_72px_64px]"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-lg',
                    exp.type === 'ai' ? 'bg-violet-100 dark:bg-violet-900' : 'bg-blue-100 dark:bg-blue-900',
                  )}
                  aria-label={exp.type === 'ai' ? 'Chat experience' : 'Search experience'}
                >
                  {exp.type === 'ai' ? (
                    <Bot className="size-3.5 text-violet-600 dark:text-violet-400" />
                  ) : (
                    <Search className="size-3.5 text-blue-600 dark:text-blue-400" />
                  )}
                </span>
                <span className="truncate text-sm font-medium">{name}</span>
                {!exp.deleted && (
                  <ArrowRight className="ml-auto size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                )}
              </span>

              {/* Narrow: one line of figures under the name */}
              <span className="flex flex-wrap gap-x-3 pl-[38px] text-xs text-muted-foreground @lg:hidden">
                <span>{volume}</span>
                <span className="inline-flex gap-1">
                  <Rate rate={exp.successRate} goodWhenHigh label="Succeeded" /> succeeded
                </span>
                <span className="inline-flex gap-1">
                  <Rate rate={exp.zeroResultRate} goodWhenHigh={false} label="Found nothing" /> found nothing
                </span>
                <span>{formatMs(exp.avgLatencyMs)}</span>
              </span>

              {/* Wide: one column per figure */}
              <span className="hidden text-right text-sm tabular-nums @lg:block">
                {formatCompact(exp.volume)}
                <span className="block text-[10px] text-muted-foreground">{exp.volume === 1 ? unit : exp.type === 'ai' ? 'conversations' : 'searches'}</span>
              </span>
              <span className="hidden text-right text-sm @lg:block">
                <Rate rate={exp.successRate} goodWhenHigh label="Succeeded" />
              </span>
              <span className="hidden text-right text-sm @lg:block">
                <Rate rate={exp.zeroResultRate} goodWhenHigh={false} label="Found nothing" />
              </span>
              <span className="hidden text-right text-sm text-muted-foreground tabular-nums @lg:block">{formatMs(exp.avgLatencyMs)}</span>
            </button>
          );
        })}

        <div className="flex flex-wrap gap-x-2 pt-1">
          {live.length > SHOWN && (
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show fewer' : `Show all ${live.length}`}
            </Button>
          )}
          {deleted.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setShowDeleted((v) => !v)}
              title="Their data is still included in the totals"
            >
              {showDeleted ? 'Hide deleted experiences' : `${pluralize(deleted.length, 'deleted experience')} in the totals`}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
