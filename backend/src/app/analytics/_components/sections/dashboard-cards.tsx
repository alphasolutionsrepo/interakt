// app/analytics/_components/sections/dashboard-cards.tsx

'use client';

/**
 * The cards the analytics sections are built from: search activity and mix,
 * query lists, and AI tool and model usage. Each takes the dashboard data it
 * shows and handles its own loading and empty states.
 */

import { BarChart3, Bot, CheckCircle2, Search, SearchX, Sparkles, TrendingUp, Wrench, X, ZoomIn } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useAnalyticsContext } from '../../_lib/AnalyticsContext';
import { useAskPanel } from '../../_lib/AskPanelContext';
import type { PopularQuery, SearchTrendPoint, ZeroResultQuery } from '../../_lib/hooks/useAnalytics';
import { formatLocalDate, resolvePeriod, type Period } from '../../_lib/period';
import {
  ChartCard,
  RankedList,
  ShareBar,
  TimeSeriesChart,
  bucketEnd,
  bucketStart,
  bucketsInPeriod,
  describeBucketRange,
  formatBucket,
  formatBucketRange,
  formatCompact,
  formatMs,
  formatPercent,
  formatTimeAgo,
  granularityForSpan,
  pluralize,
  type BucketRange,
  type Granularity,
  type ShareItem,
} from '../viz';

import { Button } from '@/shared/ui/components/button';

// ============================================================================
// HELPERS
// ============================================================================

export function safeNumber(num: number | undefined | null, fallback = 0): number {
  if (num === undefined || num === null || isNaN(num)) return fallback;
  return num;
}

/** Wildcard/empty queries are browse requests (e.g. a widget's initial load), not something a user typed */
export function isBrowseQuery(query: string): boolean {
  const q = query.trim();
  return q === '' || q === '*';
}

export function displayQuery(query: string): string {
  return isBrowseQuery(query) ? '(browse all)' : query;
}

// ============================================================================
// SECTION HEADER
// ============================================================================

/** A heading and description inside a section; without a title, just the description (the page title names the section) */
export function SectionHeader({ title, description }: { title?: string; description?: string }) {
  return (
    <div className="space-y-1">
      {title && <h2 className="text-lg font-semibold tracking-tight">{title}</h2>}
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

// ============================================================================
// SEARCH ACTIVITY (searches and no-result rate over time)
// ============================================================================

export interface ActivityRow {
  t: number;
  searches: number;
  noResults: number;
  noResultRate: number;
  avgMs: number;
}

/** Fill every bucket in the period; buckets with no searches are zero, not skipped. */
export function useActivityRows(trends: SearchTrendPoint[] | undefined, period: Period): { rows: ActivityRow[]; granularity: Granularity } {
  return useMemo(() => {
    // Resolved again whenever new data arrives, so a rolling period reaches now
    const { from, to } = resolvePeriod(period);
    const granularity = granularityForSpan(from, to);
    const byBucket = new Map<number, { searches: number; noResults: number; totalMs: number }>();
    for (const point of trends ?? []) {
      const t = bucketStart(new Date(point.timestamp).getTime(), granularity);
      const entry = byBucket.get(t) ?? { searches: 0, noResults: 0, totalMs: 0 };
      entry.searches += point.totalSearches;
      entry.noResults += point.zeroResults;
      entry.totalMs += point.avgDurationMs * point.totalSearches;
      byBucket.set(t, entry);
    }
    const rows = bucketsInPeriod(from, to, granularity).map((t) => {
      const entry = byBucket.get(t);
      const searches = entry?.searches ?? 0;
      return {
        t,
        searches,
        noResults: entry?.noResults ?? 0,
        noResultRate: searches > 0 ? (entry!.noResults / searches) : 0,
        avgMs: searches > 0 ? entry!.totalMs / searches : 0,
      };
    });
    return { rows, granularity };
  }, [trends, period]);
}

export function SearchActivityCard({
  rows,
  granularity,
  loading,
  refreshing,
}: {
  rows: ActivityRow[];
  granularity: Granularity;
  loading: boolean;
  refreshing: boolean;
}) {
  const total = rows.reduce((sum, r) => sum + r.searches, 0);
  const bucketWord = granularity === 'hour' ? 'hour' : granularity === 'day' ? 'day' : 'week';
  const [selection, setSelection] = useState<BucketRange | null>(null);
  // A pick from an earlier period or granularity no longer matches the chart
  const selectionKey = `${granularity}:${rows[0]?.t}`;
  const [selectionFor, setSelectionFor] = useState(selectionKey);
  if (selectionFor !== selectionKey) {
    setSelectionFor(selectionKey);
    setSelection(null);
  }
  const chartData = rows as unknown as Array<{ t: number } & Record<string, number>>;

  return (
    <ChartCard
      title="Search activity"
      description={`Searches per ${bucketWord}, and the share that found nothing`}
      icon={TrendingUp}
      loading={loading}
      refreshing={refreshing}
      skeletonHeight={340}
      empty={total === 0 ? 'No searches in this period' : undefined}
      table={{
        columns: [
          { key: 'time', label: granularity === 'hour' ? 'Hour' : granularity === 'day' ? 'Day' : 'Week' },
          { key: 'searches', label: 'Searches', align: 'right' },
          { key: 'noResults', label: 'No results', align: 'right' },
          { key: 'rate', label: 'No-result rate', align: 'right' },
          { key: 'avg', label: 'Avg time', align: 'right' },
        ],
        rows: [...rows].reverse().map((r) => ({
          time: formatBucket(r.t, granularity),
          searches: formatCompact(r.searches),
          noResults: formatCompact(r.noResults),
          rate: r.searches > 0 ? formatPercent(r.noResultRate) : '—',
          avg: r.searches > 0 ? formatMs(r.avgMs) : '—',
        })),
      }}
    >
      <div className="space-y-5">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Searches</p>
          <TimeSeriesChart
            data={chartData}
            series={[{ key: 'searches', label: 'Searches', color: 'var(--viz-1)' }]}
            granularity={granularity}
            formatValue={formatCompact}
            ariaLabel={`Searches per ${bucketWord}, ${formatCompact(total)} in total`}
            height={170}
            selection={selection}
            onSelect={setSelection}
          />
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Searches with no results</p>
          <TimeSeriesChart
            data={chartData}
            series={[{ key: 'noResultRate', label: 'No-result rate', color: 'var(--viz-2)' }]}
            granularity={granularity}
            formatValue={(v) => formatPercent(v, 0)}
            ariaLabel={`Share of searches with no results per ${bucketWord}`}
            height={120}
            allowDecimals
            selection={selection}
            onSelect={setSelection}
          />
        </div>
        {selection ? (
          <SelectionBar
            selection={selection}
            granularity={granularity}
            rows={rows}
            topic="search activity"
            onClear={() => setSelection(null)}
          />
        ) : (
          <p className="text-xs text-muted-foreground">Click a point, or drag across a range, to look closer.</p>
        )}
      </div>
    </ChartCard>
  );
}

/** What to do with buckets picked on a chart: look at just those, or ask about them */
function SelectionBar({
  selection,
  granularity,
  rows,
  topic,
  onClear,
}: {
  selection: BucketRange;
  granularity: Granularity;
  rows: ActivityRow[];
  /** What the question is about, e.g. "search activity" */
  topic: string;
  onClear: () => void;
}) {
  const { setPeriod } = useAnalyticsContext();
  const askPanel = useAskPanel();
  const picked = rows.filter((r) => r.t >= selection.from && r.t <= selection.to);
  const searches = picked.reduce((sum, r) => sum + r.searches, 0);
  const noResults = picked.reduce((sum, r) => sum + r.noResults, 0);
  const single = selection.from === selection.to;
  const unit = granularity === 'hour' ? 'hour' : granularity === 'day' ? 'day' : 'week';
  const label = single ? `this ${unit}` : `these ${unit}s`;

  // Periods are whole days, so hours can't be narrowed further
  const showPeriod = () => {
    const today = new Date();
    const lastDay = new Date(Math.min(bucketEnd(selection.to, granularity) - 1, today.getTime()));
    setPeriod({ from: formatLocalDate(new Date(selection.from)), to: formatLocalDate(lastDay) });
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs animate-in fade-in-0">
      <p className="mr-auto min-w-0">
        <span className="font-medium text-foreground">{formatBucketRange(selection, granularity)}</span>
        <span className="text-muted-foreground">
          {' · '}
          {pluralize(searches, 'search', 'searches')}
          {searches > 0 && ` · ${formatPercent(noResults / searches)} found nothing`}
        </span>
      </p>
      <div className="flex items-center gap-1">
        {granularity !== 'hour' && (
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={showPeriod}>
            <ZoomIn className="h-3.5 w-3.5" />
            Show {label}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => askPanel.open(`Tell me about ${topic} ${describeBucketRange(selection, granularity)}.`)}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Ask about {label}
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClear} aria-label="Clear selection">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// SEARCH MIX (search types and who searched)
// ============================================================================

export function SearchMixCard({
  types,
  byTrigger,
  loading,
  refreshing,
}: {
  types?: { lexical: number; semantic: number; hybrid: number };
  byTrigger?: { user: number; ai_tool: number; ai_rag: number; system: number };
  loading: boolean;
  refreshing: boolean;
}) {
  const typeItems: ShareItem[] = [
    { key: 'lexical', label: 'Keyword', value: types?.lexical ?? 0, color: 'var(--viz-1)' },
    { key: 'semantic', label: 'Semantic', value: types?.semantic ?? 0, color: 'var(--viz-2)' },
    { key: 'hybrid', label: 'Hybrid', value: types?.hybrid ?? 0, color: 'var(--viz-3)' },
  ];
  const triggerItems: ShareItem[] = [
    { key: 'user', label: 'Visitors', value: byTrigger?.user ?? 0, color: 'var(--viz-1)' },
    { key: 'ai', label: 'AI assistants', value: (byTrigger?.ai_tool ?? 0) + (byTrigger?.ai_rag ?? 0), color: 'var(--viz-2)' },
    { key: 'system', label: 'Automatic lookups', value: byTrigger?.system ?? 0, color: 'var(--viz-3)' },
  ];
  const typeTotal = typeItems.reduce((s, i) => s + i.value, 0);
  const triggerTotal = triggerItems.reduce((s, i) => s + i.value, 0);

  return (
    <ChartCard
      title="Search mix"
      description="How searches ran, and who made them"
      icon={BarChart3}
      loading={loading}
      refreshing={refreshing}
      skeletonHeight={340}
      empty={typeTotal + triggerTotal === 0 ? 'No searches in this period' : undefined}
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Search type</p>
          {typeTotal > 0 ? <ShareBar items={typeItems} unit="searches" /> : <p className="text-sm text-muted-foreground">No data</p>}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Made by</p>
          {triggerTotal > 0 ? <ShareBar items={triggerItems} unit="searches" /> : <p className="text-sm text-muted-foreground">No data</p>}
        </div>
      </div>
    </ChartCard>
  );
}

// ============================================================================
// QUERY LISTS
// ============================================================================

/** A row button that opens the Ask panel with a question about that row */
function AskButton({ label, question, onAsk }: { label: string; question: string; onAsk: (question: string) => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8 text-muted-foreground hover:text-foreground"
      aria-label={`Ask about ${label}`}
      title="Ask about this"
      onClick={() => onAsk(question)}
    >
      <Sparkles className="size-3.5" />
    </Button>
  );
}

export function PopularQueriesCard({
  data,
  loading,
  refreshing,
  onAsk,
}: {
  data?: PopularQuery[];
  loading: boolean;
  refreshing: boolean;
  onAsk?: (question: string) => void;
}) {
  const rows = (data ?? []).slice(0, 8);
  return (
    <ChartCard
      title="Popular searches"
      description="Most searched queries, with how often each found nothing"
      icon={Search}
      loading={loading}
      refreshing={refreshing}
      empty={rows.length === 0 ? 'No searches in this period' : undefined}
    >
      <RankedList
        valueHeader="Searches"
        detailsHeader="Results"
        rows={rows.map((q) => ({
          key: q.query,
          label: displayQuery(q.query),
          value: q.searchCount,
          valueLabel: formatCompact(q.searchCount),
          details:
            q.zeroResultCount > 0
              ? `${formatPercent(q.zeroResultCount / q.searchCount, 0)} no results`
              : `${formatCompact(q.avgResults)} avg results`,
          action: onAsk && (
            <AskButton
              label={displayQuery(q.query)}
              question={`Tell me about searches for "${displayQuery(q.query)}": how often, how well they're answered, and whether that's changing.`}
              onAsk={onAsk}
            />
          ),
        }))}
      />
    </ChartCard>
  );
}

export function FailedSearchesCard({
  data,
  emptyMessage,
  loading,
  refreshing,
  onAsk,
}: {
  data?: ZeroResultQuery[];
  emptyMessage?: string;
  loading: boolean;
  refreshing: boolean;
  onAsk?: (question: string) => void;
}) {
  const rows = (data ?? []).slice(0, 8);
  return (
    <ChartCard
      title="Failed searches"
      description="Queries that returned no results"
      icon={SearchX}
      loading={loading}
      refreshing={refreshing}
      empty={
        emptyMessage ??
        (rows.length === 0 ? (
          <span className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-viz-good" aria-hidden /> Every search found results
          </span>
        ) : undefined)
      }
    >
      <RankedList
        color="var(--viz-critical)"
        valueHeader="Searches"
        detailsHeader="Last seen"
        rows={rows.map((q) => ({
          key: q.query,
          label: displayQuery(q.query),
          value: q.occurrenceCount,
          valueLabel: formatCompact(q.occurrenceCount),
          details: formatTimeAgo(q.lastSeen),
          action: onAsk && (
            <AskButton
              label={displayQuery(q.query)}
              question={`Why do searches for "${displayQuery(q.query)}" find nothing, and what could fix it?`}
              onAsk={onAsk}
            />
          ),
        }))}
      />
    </ChartCard>
  );
}

// ============================================================================
// AI CARDS
// ============================================================================

export function ToolUsageCard({ data, loading, refreshing }: { data?: Record<string, number>; loading: boolean; refreshing: boolean }) {
  const rows = Object.entries(data ?? {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8);
  return (
    <ChartCard
      title="Tool usage"
      description="Tools the AI called most often"
      icon={Wrench}
      loading={loading}
      refreshing={refreshing}
      empty={rows.length === 0 ? 'No tool calls in this period' : undefined}
    >
      <RankedList
        valueHeader="Calls"
        rows={rows.map(([tool, count]) => ({
          key: tool,
          label: tool,
          value: count,
          valueLabel: formatCompact(count),
        }))}
      />
    </ChartCard>
  );
}

export function AIOperationsCard({
  data,
  loading,
  refreshing,
}: {
  data?: { text?: number; chat?: number; embedding?: number };
  loading: boolean;
  refreshing: boolean;
}) {
  const items: ShareItem[] = [
    { key: 'chat', label: 'Chat', value: data?.chat ?? 0, color: 'var(--viz-1)' },
    { key: 'embedding', label: 'Embeddings', value: data?.embedding ?? 0, color: 'var(--viz-2)' },
    { key: 'text', label: 'Text generation', value: data?.text ?? 0, color: 'var(--viz-3)' },
  ];
  const total = items.reduce((s, i) => s + i.value, 0);
  return (
    <ChartCard
      title="Model calls by type"
      description="What the AI was asked to do"
      icon={Bot}
      loading={loading}
      refreshing={refreshing}
      empty={total === 0 ? 'No AI activity in this period' : undefined}
    >
      <ShareBar items={items} unit="calls" />
    </ChartCard>
  );
}

