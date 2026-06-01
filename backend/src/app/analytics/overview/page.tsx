// app/analytics/overview/page.tsx

'use client';

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useAnalyticsDashboard,
  type TimeRange,
} from '../_lib/hooks/useAnalytics';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/components/card';
import { Button } from '@/shared/ui/components/button';
import { Skeleton } from '@/shared/ui/components/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/components/select';
import {
  Search,
  SearchX,
  Users,
  Star,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Activity,
  Zap,
  Target,
  Clock,
  Bot,
  Coins,
  Wrench,
  Timer,
  Sparkles,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/shared/ui/components/alert-dialog';
import { AnalyticsEmptyState } from '../_components/AnalyticsEmptyState';
import { PageHeader } from '@/shared/ui/custom/PageHeader';
import { ExperienceComparisonTable } from '../_components/ExperienceComparisonTable';
import { QualityScore, calculateQualityScore } from '../_components/QualityScore';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts';
import { RecentSearchesFeed } from '../_components/RecentSearchesFeed';
import { ExperienceSelector } from '../_components/ExperienceSelector';
import { useAnalyticsContext } from '../_lib/AnalyticsContext';
import { getThresholds } from '@/features/analytics/analytics-thresholds';

// ============================================================================
// HELPERS
// ============================================================================

function formatNumber(num: number | undefined | null): string {
  if (num === undefined || num === null || isNaN(num)) return '0';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
}

function formatPercent(rate: number | undefined | null): string {
  if (rate === undefined || rate === null || isNaN(rate)) return '0%';
  return `${(rate * 100).toFixed(1)}%`;
}

function safeNumber(num: number | undefined | null, fallback = 0): number {
  if (num === undefined || num === null || isNaN(num)) return fallback;
  return num;
}

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

// ============================================================================
// PROCESSING STATUS BANNER
// ============================================================================

function useProcessingStatus() {
  return useQuery({
    queryKey: ['analytics', 'processing-status'],
    queryFn: async () => {
      const res = await fetch('/api/analytics/process');
      if (!res.ok) throw new Error('Failed to fetch status');
      const json = await res.json();
      return json.data as {
        lastRun: { id: string; status: string; startedAt: string; completedAt: string | null; steps: unknown[] } | null;
        currentRun: { id: string; status: string; startedAt: string; steps: unknown[] } | null;
        isStale: boolean;
      };
    },
    refetchInterval: (query) => {
      // Poll fast (5s) only while processing is running, otherwise every 60s
      return query.state.data?.currentRun ? 5000 : 60000;
    },
    staleTime: 30000,
  });
}

function ProcessingStatusBanner() {
  const { data: status, refetch } = useProcessingStatus();
  const { experienceId } = useAnalyticsContext();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const queryClient = useQueryClient();

  const triggerProcessing = useCallback(async () => {
    setIsProcessing(true);
    try {
      const res = await fetch('/api/analytics/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggeredBy: 'admin', experienceId }),
      });

      if (!res.ok && res.status === 409) {
        // Already running
        refetch();
        return;
      }

      // Read SSE stream for progress
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value);
          if (text.includes('[DONE]')) break;
        }
      }
    } finally {
      setIsProcessing(false);
      refetch();
    }
  }, [refetch]);

  const isRunning = isProcessing || status?.currentRun?.status === 'running';
  const isStale = status?.isStale ?? true;
  const lastCompletedAt = status?.lastRun?.completedAt;

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="flex items-center justify-between rounded-xl border bg-card p-3">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-violet-100 p-1.5 dark:bg-violet-900">
          <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
        </div>
        <div>
          <p className="text-sm font-medium">AI Insights</p>
          <p className="text-xs text-muted-foreground">
            {isRunning ? (
              <span className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Processing analytics data...
              </span>
            ) : lastCompletedAt ? (
              <span className="flex items-center gap-1">
                {isStale ? (
                  <><AlertTriangle className="h-3 w-3 text-amber-500" /> Last refreshed {formatTimeAgo(lastCompletedAt)} — data may be stale</>
                ) : (
                  <><CheckCircle2 className="h-3 w-3 text-green-500" /> Refreshed {formatTimeAgo(lastCompletedAt)}</>
                )}
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-amber-500" /> Not yet processed — click Refresh to generate insights
              </span>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant={isStale && !isRunning ? 'default' : 'outline'}
          size="sm"
          onClick={triggerProcessing}
          disabled={isRunning}
          className="rounded-xl"
        >
          {isRunning ? (
            <><Loader2 className="mr-2 h-3 w-3 animate-spin" /> Processing...</>
          ) : (
            <><Sparkles className="mr-2 h-3 w-3" /> Refresh Insights</>
          )}
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl text-muted-foreground hover:text-destructive"
              disabled={isRunning || isClearing}
            >
              {isClearing ? (
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-3 w-3" />
              )}
              Clear Data
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear Analytics Data</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete all analytics data{experienceId ? ' for the selected experience' : ''} including processed insights, spans, search events, and chat sessions. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  setIsClearing(true);
                  try {
                    await fetch('/api/analytics/data', {
                      method: 'DELETE',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ scope: 'all', experienceId }),
                    });
                    queryClient.invalidateQueries({ queryKey: ['analytics'] });
                    refetch();
                  } finally {
                    setIsClearing(false);
                  }
                }}
              >
                Clear All Data
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

// ============================================================================
// KEY INSIGHT CARD - Hero cards at the top
// ============================================================================

interface KeyInsightCardProps {
  title: string;
  value: string;
  description: string;
  trend?: { value: string; direction: 'up' | 'down' | 'neutral' };
  variant: 'default' | 'success' | 'warning' | 'error';
  icon: React.ElementType;
}

function KeyInsightCard({
  title,
  value,
  description,
  trend,
  variant,
  icon: Icon,
}: KeyInsightCardProps) {
  const variants = {
    default: {
      bg: 'bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800',
      border: 'border-slate-200 dark:border-slate-700',
      iconBg: 'bg-slate-100 dark:bg-slate-800',
      iconColor: 'text-slate-600 dark:text-slate-400',
      trendUp: 'text-green-600',
      trendDown: 'text-red-600',
    },
    success: {
      bg: 'bg-gradient-to-br from-emerald-50 to-green-100 dark:from-emerald-950 dark:to-green-900',
      border: 'border-emerald-200 dark:border-emerald-800',
      iconBg: 'bg-emerald-100 dark:bg-emerald-900',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      trendUp: 'text-emerald-700',
      trendDown: 'text-red-600',
    },
    warning: {
      bg: 'bg-gradient-to-br from-amber-50 to-orange-100 dark:from-amber-950 dark:to-orange-900',
      border: 'border-amber-200 dark:border-amber-800',
      iconBg: 'bg-amber-100 dark:bg-amber-900',
      iconColor: 'text-amber-600 dark:text-amber-400',
      trendUp: 'text-red-600',
      trendDown: 'text-emerald-600',
    },
    error: {
      bg: 'bg-gradient-to-br from-red-50 to-rose-100 dark:from-red-950 dark:to-rose-900',
      border: 'border-red-200 dark:border-red-800',
      iconBg: 'bg-red-100 dark:bg-red-900',
      iconColor: 'text-red-600 dark:text-red-400',
      trendUp: 'text-red-700',
      trendDown: 'text-emerald-600',
    },
  };

  const style = variants[variant];

  return (
    <div className={`relative overflow-hidden rounded-2xl border p-6 ${style.bg} ${style.border}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`rounded-xl p-2.5 ${style.iconBg}`}>
            <Icon className={`h-5 w-5 ${style.iconColor}`} />
          </div>
          <span className="text-sm font-medium text-muted-foreground">{title}</span>
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-sm font-semibold ${
            trend.direction === 'up' ? style.trendUp : trend.direction === 'down' ? style.trendDown : 'text-muted-foreground'
          }`}>
            {trend.direction === 'up' ? (
              <TrendingUp className="h-4 w-4" />
            ) : trend.direction === 'down' ? (
              <TrendingDown className="h-4 w-4" />
            ) : null}
            {trend.value}
          </div>
        )}
      </div>
      <div className="mt-4">
        <p className="text-4xl font-bold tracking-tight">{value}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

// ============================================================================
// METRIC CARD - Smaller cards in the grid
// ============================================================================

interface MetricCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ElementType;
  iconBgColor: string;
  iconColor: string;
}

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconBgColor,
  iconColor,
}: MetricCardProps) {
  return (
    <Card className="rounded-2xl border-border/60 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <div className={`rounded-xl p-2.5 ${iconBgColor}`}>
            <Icon className={`size-5 ${iconColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// SECTION HEADER
// ============================================================================

interface SectionHeaderProps {
  title: string;
  description?: string;
}

function SectionHeader({ title, description }: SectionHeaderProps) {
  return (
    <div className="space-y-1">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

// ============================================================================
// SEARCH TRENDS CHART
// ============================================================================

interface TrendsChartProps {
  data?: Array<{
    timestamp: string;
    totalSearches: number;
    uniqueQueries: number;
    zeroResults: number;
    avgDurationMs: number;
  }>;
  isLoading?: boolean;
}

function SearchTrendsChart({ data, isLoading }: TrendsChartProps) {
  if (isLoading) {
    return (
      <Card className="rounded-2xl border-border/60 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-indigo-500/15 p-2.5">
              <TrendingUp className="size-5 text-indigo-500" />
            </div>
            <CardTitle className="text-lg font-semibold">Search Trends</CardTitle>
          </div>
          <p className="ml-12 text-sm text-muted-foreground">Search volume over time by type</p>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[280px] w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  const chartData = (data || []).map((d) => ({
    date: new Date(d.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    searches: d.totalSearches,
    unique: d.uniqueQueries,
  }));

  return (
    <Card className="rounded-2xl border-border/60 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-500/15 p-2.5">
            <TrendingUp className="size-5 text-indigo-500" />
          </div>
          <CardTitle className="text-lg font-semibold">Search Trends</CardTitle>
        </div>
        <p className="ml-12 text-sm text-muted-foreground">Search volume over time by type</p>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          {chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              No trend data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="searchGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="uniqueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  dx={-10}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '12px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="searches"
                  stroke="#6366f1"
                  fill="url(#searchGradient)"
                  strokeWidth={2.5}
                  name="Total Searches"
                />
                <Area
                  type="monotone"
                  dataKey="unique"
                  stroke="#22c55e"
                  fill="url(#uniqueGradient)"
                  strokeWidth={2.5}
                  name="Unique Queries"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="mt-4 flex items-center justify-center gap-8">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-indigo-500" />
            <span className="text-sm text-muted-foreground">Total Searches</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-green-500" />
            <span className="text-sm text-muted-foreground">Unique Queries</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// SEARCH TYPES DONUT CHART
// ============================================================================

interface SearchTypesChartProps {
  data?: { lexical: number; semantic: number; hybrid: number };
  isLoading?: boolean;
}

const COLORS = ['#6366f1', '#22c55e', '#f59e0b'];
const TYPE_LABELS = ['Lexical', 'Semantic', 'Hybrid'];

function SearchTypesChart({ data, isLoading }: SearchTypesChartProps) {
  if (isLoading) {
    return (
      <Card className="rounded-2xl border-border/60 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-violet-500/15 p-2.5">
              <BarChart3 className="size-5 text-violet-500" />
            </div>
            <CardTitle className="text-lg font-semibold">Search Types</CardTitle>
          </div>
          <p className="ml-12 text-sm text-muted-foreground">Distribution of search types</p>
        </CardHeader>
        <CardContent>
          <Skeleton className="mx-auto h-[200px] w-[200px] rounded-full" />
        </CardContent>
      </Card>
    );
  }

  const chartData = data
    ? [
        { type: 'Lexical', count: data.lexical },
        { type: 'Semantic', count: data.semantic },
        { type: 'Hybrid', count: data.hybrid },
      ].filter((d) => d.count > 0)
    : [];
  const total = chartData.reduce((sum, d) => sum + d.count, 0);

  return (
    <Card className="rounded-2xl border-border/60 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-violet-500/15 p-2.5">
            <BarChart3 className="size-5 text-violet-500" />
          </div>
          <CardTitle className="text-lg font-semibold">Search Types</CardTitle>
        </div>
        <p className="ml-12 text-sm text-muted-foreground">Distribution of search types</p>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-center">
          <div className="relative h-[200px] w-[200px]">
            {total === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No data yet
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="count"
                    >
                      {chartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[TYPE_LABELS.indexOf(entry.type)] || COLORS[0]}
                          strokeWidth={0}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [formatNumber(value), 'Searches']}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '12px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold">{formatNumber(total)}</span>
                  <span className="text-xs text-muted-foreground">Total</span>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="mt-4 flex justify-center gap-6">
          {TYPE_LABELS.map((type, index) => {
            const item = chartData.find((d) => d.type === type);
            const count = item?.count || 0;
            const percent = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={type} className="flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: COLORS[index] }}
                />
                <span className="text-sm text-muted-foreground">{type}</span>
                <span className="text-sm font-semibold">{percent}%</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// POPULAR QUERIES TABLE
// ============================================================================

interface PopularQueriesProps {
  data?: Array<{ query: string; searchCount: number; avgResults: number }>;
  isLoading?: boolean;
}

function PopularQueries({ data, isLoading }: PopularQueriesProps) {
  if (isLoading) {
    return (
      <Card className="rounded-2xl border-border/60 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-500/15 p-2.5">
              <Search className="size-5 text-blue-500" />
            </div>
            <CardTitle className="text-lg font-semibold">Popular Searches</CardTitle>
          </div>
          <p className="ml-12 text-sm text-muted-foreground">Top queries by search volume</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const queries = data?.slice(0, 8) || [];

  return (
    <Card className="rounded-2xl border-border/60 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-500/15 p-2.5">
            <Search className="size-5 text-blue-500" />
          </div>
          <CardTitle className="text-lg font-semibold">Popular Searches</CardTitle>
        </div>
        <p className="ml-12 text-sm text-muted-foreground">Top queries by search volume</p>
      </CardHeader>
      <CardContent>
        {queries.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
            No search data yet
          </div>
        ) : (
          <div className="space-y-2">
            {queries.map((item, index) => (
              <div
                key={item.query}
                className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3 transition-colors hover:bg-muted/60"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                    {index + 1}
                  </span>
                  <span className="font-medium">{item.query}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground">
                    {formatNumber(item.avgResults)} results
                  </span>
                  <span className="min-w-[50px] text-right text-sm font-bold text-primary">
                    {formatNumber(item.searchCount)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// FAILED SEARCHES TABLE
// ============================================================================

interface FailedSearchesProps {
  data?: Array<{ query: string; occurrenceCount: number; lastSeen: string }>;
  isLoading?: boolean;
}

function FailedSearches({ data, isLoading }: FailedSearchesProps) {
  if (isLoading) {
    return (
      <Card className="rounded-2xl border-border/60 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-red-500/15 p-2.5">
              <SearchX className="size-5 text-red-500" />
            </div>
            <CardTitle className="text-lg font-semibold">Failed Searches</CardTitle>
          </div>
          <p className="ml-12 text-sm text-muted-foreground">Queries that returned no results</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const queries = data?.slice(0, 8) || [];

  return (
    <Card className="rounded-2xl border-border/60 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-red-500/15 p-2.5">
            <SearchX className="size-5 text-red-500" />
          </div>
          <CardTitle className="text-lg font-semibold">Failed Searches</CardTitle>
        </div>
        <p className="ml-12 text-sm text-muted-foreground">Queries that returned no results</p>
      </CardHeader>
      <CardContent>
        {queries.length === 0 ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-2">
            <div className="rounded-full bg-green-100 p-3 dark:bg-green-900">
              <Target className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <p className="font-medium text-green-600 dark:text-green-400">All searches successful!</p>
            <p className="text-sm text-muted-foreground">No zero-result queries detected</p>
          </div>
        ) : (
          <div className="space-y-2">
            {queries.map((item) => (
              <div
                key={item.query}
                className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50/50 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/20"
              >
                <span className="font-medium text-red-700 dark:text-red-300">{item.query}</span>
                <span className="text-sm font-bold text-red-600 dark:text-red-400">
                  {formatNumber(item.occurrenceCount)} searches
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// AI OPERATIONS DONUT CHART
// ============================================================================

const AI_OP_COLORS = ['#8b5cf6', '#3b82f6', '#f59e0b'];
const AI_OP_LABELS = ['Text', 'Chat', 'Embedding'];

function AIOperationsChart({ data, isLoading }: { data?: { text?: number; chat?: number; embedding?: number }; isLoading?: boolean }) {
  if (isLoading) {
    return (
      <Card className="rounded-2xl border-border/60 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-violet-500/15 p-2.5">
              <Bot className="size-5 text-violet-500" />
            </div>
            <CardTitle className="text-lg font-semibold">AI Operations</CardTitle>
          </div>
          <p className="ml-12 text-sm text-muted-foreground">Breakdown by operation type</p>
        </CardHeader>
        <CardContent>
          <Skeleton className="mx-auto h-[200px] w-[200px] rounded-full" />
        </CardContent>
      </Card>
    );
  }

  const chartData = data
    ? [
        { type: 'Text', count: data.text || 0 },
        { type: 'Chat', count: data.chat || 0 },
        { type: 'Embedding', count: data.embedding || 0 },
      ].filter((d) => d.count > 0)
    : [];
  const total = chartData.reduce((sum, d) => sum + d.count, 0);

  return (
    <Card className="rounded-2xl border-border/60 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-violet-500/15 p-2.5">
            <Bot className="size-5 text-violet-500" />
          </div>
          <CardTitle className="text-lg font-semibold">AI Operations</CardTitle>
        </div>
        <p className="ml-12 text-sm text-muted-foreground">Breakdown by operation type</p>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-center">
          <div className="relative h-[200px] w-[200px]">
            {total === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No AI activity yet
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={chartData} cx="50%" cy="50%" innerRadius={65} outerRadius={85} paddingAngle={3} dataKey="count">
                      {chartData.map((entry, index) => (
                        <Cell key={`ai-cell-${index}`} fill={AI_OP_COLORS[AI_OP_LABELS.indexOf(entry.type)] || AI_OP_COLORS[0]} strokeWidth={0} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [formatNumber(value), 'Requests']}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold">{formatNumber(total)}</span>
                  <span className="text-xs text-muted-foreground">Total</span>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="mt-4 flex justify-center gap-6">
          {AI_OP_LABELS.map((type, index) => {
            const item = chartData.find((d) => d.type === type);
            const count = item?.count || 0;
            const percent = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={type} className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: AI_OP_COLORS[index] }} />
                <span className="text-sm text-muted-foreground">{type}</span>
                <span className="text-sm font-semibold">{percent}%</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// TOOL USAGE BAR CHART
// ============================================================================

function ToolUsageChart({ data, isLoading }: { data?: Record<string, number>; isLoading?: boolean }) {
  if (isLoading) {
    return (
      <Card className="rounded-2xl border-border/60 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-orange-500/15 p-2.5">
              <Wrench className="size-5 text-orange-500" />
            </div>
            <CardTitle className="text-lg font-semibold">Tool Usage</CardTitle>
          </div>
          <p className="ml-12 text-sm text-muted-foreground">Most used AI tools</p>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[280px] w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  const chartData = data
    ? Object.entries(data)
        .map(([tool, executions]) => ({
          name: tool.length > 20 ? tool.slice(0, 18) + '…' : tool,
          executions,
        }))
        .sort((a, b) => b.executions - a.executions)
        .slice(0, 6)
    : [];

  return (
    <Card className="rounded-2xl border-border/60 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-orange-500/15 p-2.5">
            <Wrench className="size-5 text-orange-500" />
          </div>
          <CardTitle className="text-lg font-semibold">Tool Usage</CardTitle>
        </div>
        <p className="ml-12 text-sm text-muted-foreground">Most used AI tools</p>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
            No tool usage data yet
          </div>
        ) : (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis type="category" dataKey="name" width={120} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip
                  formatter={(value: number) => [formatNumber(value), 'Executions']}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px' }}
                />
                <Bar dataKey="executions" fill="#f97316" radius={[0, 6, 6, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function AnalyticsOverviewPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const queryClient = useQueryClient();
  const { experienceId, experienceType, experienceName } = useAnalyticsContext();

  const { data, isLoading, isFetching } = useAnalyticsDashboard(timeRange, experienceId);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['analytics'] });
  };

  // Calculate metrics
  const totalSearches = safeNumber(data?.overview?.totalSearches);
  const zeroResultRate = safeNumber(data?.overview?.zeroResultRate);
  const failedSearches = Math.round(totalSearches * zeroResultRate);
  const successRate = 1 - zeroResultRate;
  const avgDuration = safeNumber(data?.overview?.avgSearchDurationMs);

  // Quality score (when specific experience selected)
  const avgResults = data?.popularQueries?.length
    ? data.popularQueries.reduce((sum: number, q: { avgResults: number }) => sum + q.avgResults, 0) / data.popularQueries.length
    : 0;
  const qualityScore = calculateQualityScore(zeroResultRate, avgResults, avgDuration);
  const isAllExperiences = !experienceId;
  const isSearchExperience = experienceType === 'search';
  const isAIExperience = experienceType === 'ai';
  const showAI = isAllExperiences || isAIExperience;
  const showSearch = isAllExperiences || isSearchExperience || isAIExperience;

  // Determine status variants based on env-aware thresholds
  const t = getThresholds();

  const getSuccessVariant = (): 'success' | 'warning' | 'error' => {
    if (successRate >= t.successRate.excellent) return 'success';
    if (successRate >= t.successRate.good) return 'warning';
    return 'error';
  };

  const getSpeedVariant = (): 'success' | 'warning' | 'default' => {
    if (avgDuration < t.latency.excellent) return 'success';
    if (avgDuration < t.latency.acceptable) return 'default';
    return 'warning';
  };

  const getSpeedDescription = (): string => {
    if (avgDuration === 0) return 'No searches recorded yet';
    if (avgDuration < t.latency.excellent) return 'Search performance improved';
    if (avgDuration < t.latency.acceptable) return 'Good search performance';
    return 'Consider optimizing search';
  };

  const getActivityDescription = (): string => {
    if (totalSearches === 0) return 'No search activity detected';
    if (totalSearches < 100) return 'Low search activity';
    if (totalSearches < 1000) return 'Moderate search activity';
    return 'High search activity';
  };

  const getSuccessDescription = (): string => {
    if (totalSearches === 0) return 'No searches to analyze';
    if (successRate >= t.successRate.excellent) return 'Excellent search success rate';
    if (successRate >= t.successRate.good) return 'Good search success rate';
    if (successRate >= t.successRate.good * 0.75) return 'Search success needs improvement';
    return 'Poor search success rate - urgent attention needed';
  };

  const timeRangeLabel = timeRange === '1h' ? 'hour' : timeRange === '24h' ? '24 hours' : timeRange === '7d' ? '7 days' : '30 days';

  // Check if there's any data at all
  const totalAIRequests = safeNumber(data?.overview?.totalAIRequests);
  const hasData = totalSearches > 0 || totalAIRequests > 0;

  // Show empty state only when viewing all experiences and there's truly no data
  if (!isLoading && !hasData && isAllExperiences) {
    return (
      <div className="flex-1 space-y-6 p-6 lg:p-8">
        <PageHeader
          variant="hero"
          title="Search Analytics"
          description="Real-time insights into your search performance"
          icon={BarChart3}
          iconBg="bg-blue-500/10"
          iconColor="text-blue-500"
          actions={
            <>
              <ExperienceSelector />
              <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
                <SelectTrigger className="w-[140px] rounded-xl">
                  <Clock className="mr-2 size-4 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">Last Hour</SelectItem>
                  <SelectItem value="24h">Last 24 Hours</SelectItem>
                  <SelectItem value="7d">Last 7 Days</SelectItem>
                  <SelectItem value="30d">Last 30 Days</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={handleRefresh}
                disabled={isFetching}
                className="size-9 rounded-xl"
              >
                <RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} />
              </Button>
            </>
          }
        />
        <AnalyticsEmptyState variant="overview" onRefresh={handleRefresh} />
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-6 lg:p-8">
      {/* Header */}
      <PageHeader
        variant="hero"
        title="Analytics Overview"
        description={isAllExperiences ? 'Performance across all experiences' : `Analytics for ${experienceName}`}
        icon={BarChart3}
        iconBg="bg-blue-500/10"
        iconColor="text-blue-500"
        actions={
          <>
            <ExperienceSelector />
            <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
              <SelectTrigger className="w-[140px] rounded-xl">
                <Clock className="mr-2 size-4 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1h">Last Hour</SelectItem>
                <SelectItem value="24h">Last 24 Hours</SelectItem>
                <SelectItem value="7d">Last 7 Days</SelectItem>
                <SelectItem value="30d">Last 30 Days</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={isFetching}
              className="size-9 rounded-xl"
            >
              <RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </>
        }
      />

      {/* AI Insights Processing */}
      <ProcessingStatusBanner />

      {/* Experience Comparison (when All Experiences selected) */}
      {isAllExperiences && (
        <ExperienceComparisonTable timeRange={timeRange} />
      )}

      {/* Quality Score (when specific experience selected) */}
      {!isAllExperiences && hasData && (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <QualityScore
            score={qualityScore}
            successRate={successRate}
            avgResults={avgResults}
            responseTimeMs={avgDuration}
            isLoading={isLoading}
          />
          <div className="flex items-center">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">{experienceName}</h3>
              <p className="text-sm text-muted-foreground">
                {experienceType === 'ai' ? 'AI Experience' : 'Search Experience'} — {formatNumber(experienceType === 'ai' ? totalAIRequests : totalSearches)} {experienceType === 'ai' ? 'conversations' : 'searches'} in this period
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Key Insights - Hero Section */}
      <div className="space-y-6">
        <SectionHeader
          title="Key Insights"
          description={isSearchExperience ? "What's happening with your search right now" : isAIExperience ? 'AI and search performance at a glance' : "What's happening with your search right now"}
        />
        <div className={`grid gap-6 md:grid-cols-2 ${showAI ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
          {isLoading ? (
            <>
              <Skeleton className="h-[160px] rounded-2xl" />
              <Skeleton className="h-[160px] rounded-2xl" />
              <Skeleton className="h-[160px] rounded-2xl" />
              {showAI && <Skeleton className="h-[160px] rounded-2xl" />}
            </>
          ) : (
            <>
              <KeyInsightCard
                title="Search Activity"
                value={formatNumber(totalSearches)}
                description={getActivityDescription()}
                trend={totalSearches > 0 ? { value: `vs last ${timeRangeLabel}`, direction: 'neutral' } : undefined}
                variant="default"
                icon={Activity}
              />
              <KeyInsightCard
                title="Search Speed"
                value={formatMs(avgDuration)}
                description={getSpeedDescription()}
                trend={avgDuration > 0 ? { value: avgDuration < 300 ? '↑ 100.0%' : '−', direction: avgDuration < 300 ? 'up' : 'neutral' } : undefined}
                variant={getSpeedVariant()}
                icon={Zap}
              />
              <KeyInsightCard
                title="Search Success Rate"
                value={formatPercent(successRate)}
                description={getSuccessDescription()}
                trend={successRate < 1 ? { value: `${failedSearches} failed`, direction: successRate < 0.8 ? 'down' : 'neutral' } : undefined}
                variant={getSuccessVariant()}
                icon={Target}
              />
              {showAI && (
                <KeyInsightCard
                  title="AI Activity"
                  value={formatNumber(totalAIRequests)}
                  description={
                    totalAIRequests > 0
                      ? `${formatNumber(totalAIRequests)} requests in last ${timeRangeLabel}`
                      : 'No AI activity yet'
                  }
                  variant="default"
                  icon={Bot}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Search Volume & Usage */}
      <div className="space-y-6">
        <SectionHeader
          title="Search Volume & Usage"
          description="Understanding your search traffic patterns"
        />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Total Searches"
            value={formatNumber(totalSearches)}
            subtitle={`in last ${timeRangeLabel}`}
            icon={Search}
            iconBgColor="bg-blue-100 dark:bg-blue-900"
            iconColor="text-blue-600 dark:text-blue-400"
          />
          <MetricCard
            title="Failed Searches"
            value={formatNumber(failedSearches)}
            subtitle={`${formatPercent(zeroResultRate)} of all searches`}
            icon={SearchX}
            iconBgColor="bg-red-100 dark:bg-red-900"
            iconColor="text-red-600 dark:text-red-400"
          />
          <MetricCard
            title="User Engagement"
            value={
              data?.overview?.uniqueQueries && totalSearches
                ? (totalSearches / Math.max(data.overview.uniqueQueries, 1)).toFixed(1)
                : '0.0'
            }
            subtitle="searches per user on average"
            icon={Users}
            iconBgColor="bg-purple-100 dark:bg-purple-900"
            iconColor="text-purple-600 dark:text-purple-400"
          />
          <MetricCard
            title="Most Popular Search"
            value={data?.popularQueries?.[0]?.query || 'N/A'}
            subtitle={
              data?.popularQueries?.[0]
                ? `searched ${formatNumber(data.popularQueries[0].searchCount)} times`
                : 'No data yet'
            }
            icon={Star}
            iconBgColor="bg-amber-100 dark:bg-amber-900"
            iconColor="text-amber-600 dark:text-amber-400"
          />
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SearchTrendsChart data={data?.trends} isLoading={isLoading} />
        </div>
        <div>
          <SearchTypesChart data={data?.searchTypes} isLoading={isLoading} />
        </div>
      </div>

      {/* Tables Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <PopularQueries data={data?.popularQueries} isLoading={isLoading} />
        <FailedSearches data={data?.zeroResults} isLoading={isLoading} />
      </div>

      {/* AI & Tools (hidden for search-only experiences) */}
      {showAI && (
        <>
          <div className="space-y-6">
            <SectionHeader
              title="AI & Tools"
              description="AI usage, token consumption, and tool execution metrics"
            />
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                title="AI Requests"
                value={formatNumber(totalAIRequests)}
                subtitle={`in last ${timeRangeLabel}`}
                icon={Bot}
                iconBgColor="bg-violet-100 dark:bg-violet-900"
                iconColor="text-violet-600 dark:text-violet-400"
              />
              <MetricCard
                title="Token Usage"
                value={formatNumber(safeNumber(data?.aiUsage?.totalTokens))}
                subtitle={`${formatNumber(safeNumber(data?.aiUsage?.inputTokens))} in / ${formatNumber(safeNumber(data?.aiUsage?.outputTokens))} out`}
                icon={Coins}
                iconBgColor="bg-sky-100 dark:bg-sky-900"
                iconColor="text-sky-600 dark:text-sky-400"
              />
              <MetricCard
                title="Tool Executions"
                value={formatNumber(safeNumber(data?.toolUsage?.totalExecutions))}
                subtitle={
                  data?.toolUsage?.successRate != null
                    ? `${(data.toolUsage.successRate * 100).toFixed(1)}% success rate`
                    : `in last ${timeRangeLabel}`
                }
                icon={Wrench}
                iconBgColor="bg-orange-100 dark:bg-orange-900"
                iconColor="text-orange-600 dark:text-orange-400"
              />
              <MetricCard
                title="Avg AI Latency"
                value={formatMs(safeNumber(data?.overview?.avgAIDurationMs))}
                subtitle={
                  data?.overview?.avgSearchDurationMs
                    ? `Search: ${formatMs(data.overview.avgSearchDurationMs)}`
                    : `in last ${timeRangeLabel}`
                }
                icon={Timer}
                iconBgColor="bg-teal-100 dark:bg-teal-900"
                iconColor="text-teal-600 dark:text-teal-400"
              />
            </div>
          </div>

          {/* AI Charts Row */}
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ToolUsageChart data={data?.toolUsage?.byTool} isLoading={isLoading} />
            </div>
            <div>
              <AIOperationsChart data={data?.aiUsage?.byOperation} isLoading={isLoading} />
            </div>
          </div>
        </>
      )}

      {/* Recent Activity */}
      <div className="space-y-6">
        <SectionHeader
          title="Recent Activity"
          description="Live feed of recent search events"
        />
        <RecentSearchesFeed data={data?.recentSearches} isLoading={isLoading} />
      </div>

      {/* Footer */}
      {data?.meta && (
        <div className="text-right text-xs text-muted-foreground">
          Last updated: {new Date(data.meta.generatedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}
