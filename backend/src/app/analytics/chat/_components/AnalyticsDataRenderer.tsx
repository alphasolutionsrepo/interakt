// app/analytics/chat/_components/AnalyticsDataRenderer.tsx

'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/components/card';
import { Badge } from '@/shared/ui/components/badge';
import { Progress } from '@/shared/ui/components/progress';
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Search,
  Bot,
  AlertCircle,
  Zap,
  DollarSign,
  Activity,
  Target,
  Wrench,
  CheckCircle2,
  ShieldCheck,
  TrendingUp,
  BarChart3,
  MessageSquare,
  ArrowRight,
  CircleDot,
  Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getLatencyColor as getLatencyColorFn,
  getRealZeroResultColor,
  getSuccessRateColor,
  getIntentSuccessStyle,
  getZeroResultStatus,
  getThresholds,
} from '@/features/analytics/analytics-thresholds';

// ============================================================================
// TYPES
// ============================================================================

interface AnalyticsDataBlock {
  tool: string;
  dataType: string;
  data: unknown;
}

interface AnalyticsDataRendererProps {
  dataBlocks: AnalyticsDataBlock[];
}

// ============================================================================
// HELPERS
// ============================================================================

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
}

function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.round(ms)}ms`;
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatCurrency(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

// ============================================================================
// OVERVIEW METRICS COMPONENT
// ============================================================================

interface OverviewMetrics {
  totalSearches: number;
  totalAIRequests: number;
  uniqueQueries: number;
  zeroResultRate: number;
  avgSearchDurationMs: number;
  avgAIDurationMs: number;
  searchesByTrigger: {
    user: number;
    ai_tool: number;
    ai_rag: number;
    system: number;
  };
}

function OverviewMetricsRenderer({ data }: { data: OverviewMetrics }) {
  // Check for no data scenario
  const hasNoData = data.totalSearches === 0 && data.totalAIRequests === 0;

  if (hasNoData) {
    return (
      <div className="flex items-center gap-2 py-2 text-muted-foreground">
        <AlertCircle className="h-4 w-4 text-amber-500" />
        <span className="text-sm">No activity recorded in this period</span>
      </div>
    );
  }

  const metrics = [
    {
      label: 'Total Searches',
      value: formatNumber(data.totalSearches),
      subtext: `${formatNumber(data.uniqueQueries)} unique`,
      icon: Search,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      label: 'AI Requests',
      value: formatNumber(data.totalAIRequests),
      subtext: `${formatNumber(data.searchesByTrigger.ai_tool + data.searchesByTrigger.ai_rag)} AI-triggered`,
      icon: Bot,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
    },
    {
      label: 'Zero Result Rate',
      value: formatPercent(data.zeroResultRate),
      subtext: getZeroResultStatus(data.zeroResultRate).isWarning ? 'Needs attention' : 'Healthy',
      icon: getZeroResultStatus(data.zeroResultRate).isWarning ? AlertCircle : Target,
      color: getZeroResultStatus(data.zeroResultRate).isWarning ? 'text-amber-500' : 'text-green-500',
      bgColor: getZeroResultStatus(data.zeroResultRate).isWarning ? 'bg-amber-500/10' : 'bg-green-500/10',
    },
    {
      label: 'Avg Latency',
      value: formatDuration(data.avgSearchDurationMs),
      subtext: `AI: ${formatDuration(data.avgAIDurationMs)}`,
      icon: Zap,
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="flex items-center gap-2 rounded-lg bg-muted/50 p-2"
        >
          <div className={cn('rounded-md p-1.5', metric.bgColor)}>
            <metric.icon className={cn('h-3.5 w-3.5', metric.color)} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{metric.label}</p>
            <p className="text-sm font-semibold">{metric.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// SEARCH TRENDS COMPONENT
// ============================================================================

interface SearchTrendPoint {
  timestamp: string;
  totalSearches: number;
  uniqueQueries: number;
  zeroResults: number;
  avgDurationMs: number;
}

function SearchTrendsRenderer({ data }: { data: SearchTrendPoint[] }) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Determine time format
    const firstDate = new Date(data[0].timestamp);
    const lastDate = new Date(data[data.length - 1].timestamp);
    const rangeHours = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60);
    const showTime = rangeHours <= 48;

    return data.map((point) => ({
      ...point,
      time: new Date(point.timestamp).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        ...(showTime && { hour: '2-digit', minute: '2-digit' }),
      }),
    }));
  }, [data]);

  if (chartData.length === 0) {
    return (
      <div className="flex items-center gap-2 py-2 text-muted-foreground">
        <AlertCircle className="h-4 w-4 text-amber-500" />
        <span className="text-sm">No search trend data available for this period</span>
      </div>
    );
  }

  return (
    <div className="h-[180px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
          <defs>
            <linearGradient id="searchGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="time" fontSize={10} tickLine={false} axisLine={false} />
          <YAxis fontSize={10} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '6px',
              fontSize: '12px',
            }}
          />
          <Area
            type="monotone"
            dataKey="totalSearches"
            stroke="hsl(var(--primary))"
            fill="url(#searchGradient)"
            strokeWidth={2}
            name="Searches"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================================
// POPULAR QUERIES COMPONENT
// ============================================================================

interface PopularQuery {
  query: string;
  searchCount: number;
  zeroResultCount: number;
  avgResults: number;
}

function PopularQueriesRenderer({ data }: { data: PopularQuery[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center gap-2 py-2 text-muted-foreground">
        <AlertCircle className="h-4 w-4 text-amber-500" />
        <span className="text-sm">No popular queries found in this period</span>
      </div>
    );
  }

  const topQueries = data.slice(0, 8);

  return (
    <div className="space-y-1.5">
      {topQueries.map((query, idx) => (
        <div
          key={idx}
          className="flex items-center gap-2 rounded-md bg-muted/30 px-2 py-1.5"
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
            {idx + 1}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm">{query.query}</span>
          <Badge variant="secondary" className="shrink-0 text-xs">
            {formatNumber(query.searchCount)}
          </Badge>
          {query.zeroResultCount > 0 && (
            <Badge variant="destructive" className="shrink-0 text-xs">
              {query.zeroResultCount} failed
            </Badge>
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// ZERO RESULT QUERIES COMPONENT
// ============================================================================

interface ZeroResultQuery {
  query: string;
  occurrenceCount: number;
  firstSeen: string;
  lastSeen: string;
  status: string;
}

function ZeroResultQueriesRenderer({ data }: { data: ZeroResultQuery[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center gap-2 py-2 text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-green-500" />
        <span className="text-sm">All searches returned results - no content gaps found</span>
      </div>
    );
  }

  const topQueries = data.slice(0, 6);

  return (
    <div className="space-y-1.5">
      {topQueries.map((query, idx) => (
        <div
          key={idx}
          className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50/50 px-2 py-1.5 dark:border-red-900 dark:bg-red-950/30"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
          <span className="min-w-0 flex-1 truncate text-sm">{query.query}</span>
          <Badge variant="outline" className="shrink-0 text-xs">
            {query.occurrenceCount}x
          </Badge>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// SEARCH TYPE BREAKDOWN COMPONENT
// ============================================================================

interface SearchTypeBreakdown {
  lexical: number;
  semantic: number;
  hybrid: number;
}

const SEARCH_TYPE_COLORS = ['#6366f1', '#22c55e', '#f59e0b'];

function SearchTypeBreakdownRenderer({ data }: { data: SearchTypeBreakdown }) {
  const total = data.lexical + data.semantic + data.hybrid;

  if (total === 0) {
    return (
      <div className="flex items-center gap-2 py-2 text-muted-foreground">
        <AlertCircle className="h-4 w-4 text-amber-500" />
        <span className="text-sm">No searches recorded in this period</span>
      </div>
    );
  }

  const chartData = [
    { name: 'Lexical', value: data.lexical },
    { name: 'Semantic', value: data.semantic },
    { name: 'Hybrid', value: data.hybrid },
  ].filter((d) => d.value > 0);

  return (
    <div className="flex items-center gap-4">
      <div className="h-[120px] w-[120px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={35}
              outerRadius={55}
              paddingAngle={2}
              dataKey="value"
            >
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={SEARCH_TYPE_COLORS[index]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
                fontSize: '12px',
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-1.5 text-sm">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-[#6366f1]" />
          <span>Lexical: {formatPercent(data.lexical / total)}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-[#22c55e]" />
          <span>Semantic: {formatPercent(data.semantic / total)}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
          <span>Hybrid: {formatPercent(data.hybrid / total)}</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// PERFORMANCE METRICS COMPONENT
// ============================================================================

interface PerformanceMetrics {
  avgDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
  avgEsDurationMs: number;
  avgEmbeddingDurationMs: number;
}

function getLatencyColor(ms: number): string {
  return getLatencyColorFn(ms);
}

function getLatencyPercent(ms: number): number {
  // Inverse: lower is better, cap at 1000ms
  return Math.max(0, Math.min(100, 100 - (ms / 10)));
}

function PerformanceMetricsRenderer({ data }: { data: PerformanceMetrics }) {
  // Check for no data scenario - all zeros means no searches occurred
  const hasNoData =
    data.avgDurationMs === 0 &&
    data.p50DurationMs === 0 &&
    data.p95DurationMs === 0 &&
    data.p99DurationMs === 0;

  if (hasNoData) {
    return (
      <div className="flex items-center gap-2 py-2 text-muted-foreground">
        <AlertCircle className="h-4 w-4 text-amber-500" />
        <span className="text-sm">No searches recorded in this period</span>
      </div>
    );
  }

  const percentiles = [
    { label: 'Average', value: data.avgDurationMs },
    { label: 'p50', value: data.p50DurationMs },
    { label: 'p95', value: data.p95DurationMs },
    { label: 'p99', value: data.p99DurationMs },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {percentiles.map((p) => (
          <div key={p.label} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{p.label}</span>
              <span className="font-medium">{formatDuration(p.value)}</span>
            </div>
            <Progress
              value={getLatencyPercent(p.value)}
              className={cn('h-1.5', getLatencyColor(p.value))}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>ES: {formatDuration(data.avgEsDurationMs)}</span>
        <span>Embedding: {formatDuration(data.avgEmbeddingDurationMs)}</span>
      </div>
    </div>
  );
}

// ============================================================================
// CUSTOMER INTENT ANALYSIS COMPONENT
// ============================================================================

interface IntentCluster {
  label: string;
  count: number;
  avgOutcomeSuccess: number;
  topQueries: string[];
  samples: string[];
}

interface CustomerIntentsData {
  clusters: IntentCluster[];
  totalIntents: number;
  uniqueIntents: number;
  empty?: boolean;
}

function CustomerIntentRenderer({ data }: { data: CustomerIntentsData }) {
  if (data.empty || !data.clusters || data.clusters.length === 0) {
    return (
      <div className="flex items-center gap-2 py-2 text-muted-foreground">
        <AlertCircle className="h-4 w-4 text-amber-500" />
        <span className="text-sm">No intent data available. Run Refresh Insights first.</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-muted/50 p-2.5 text-center">
          <p className="text-lg font-semibold">{data.totalIntents}</p>
          <p className="text-xs text-muted-foreground">Total Queries</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-2.5 text-center">
          <p className="text-lg font-semibold">{data.uniqueIntents}</p>
          <p className="text-xs text-muted-foreground">Unique Intents</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-2.5 text-center">
          <p className="text-lg font-semibold">{data.clusters.length}</p>
          <p className="text-xs text-muted-foreground">Categories</p>
        </div>
      </div>
      <div className="space-y-2">
        {data.clusters.slice(0, 8).map((cluster, idx) => {
          const successColor = getIntentSuccessStyle(cluster.avgOutcomeSuccess);

          return (
            <div key={idx} className={cn('rounded-lg border border-l-4 p-3', successColor)}>
              <div className="flex items-center justify-between">
                <span className="font-medium">{cluster.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {(cluster.avgOutcomeSuccess * 100).toFixed(0)}% resolved
                  </span>
                  <Badge variant="secondary">{cluster.count}</Badge>
                </div>
              </div>
              {cluster.topQueries?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {cluster.topQueries.slice(0, 3).map((q, qIdx) => (
                    <span key={qIdx} className="text-xs bg-background/80 rounded-md px-2 py-0.5 text-muted-foreground border">
                      &quot;{q}&quot;
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// CATALOG HEALTH COMPONENT
// ============================================================================

interface CatalogHealthData {
  apparentZeroResultRate: number;
  realZeroResultRate: number;
  totalSearches: number;
  totalDedupedSearches: number;
  retryCount: number;
  retryRate: number;
  topZeroResultQueries: Array<{ query: string; count: number }>;
  empty?: boolean;
}

function CatalogHealthRenderer({ data }: { data: CatalogHealthData }) {
  if (data.empty) {
    return (
      <div className="flex items-center gap-2 py-2 text-muted-foreground">
        <AlertCircle className="h-4 w-4 text-amber-500" />
        <span className="text-sm">No catalog health data available. Run Refresh Insights first.</span>
      </div>
    );
  }

  const realRate = data.realZeroResultRate;
  const apparentRate = data.apparentZeroResultRate;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-muted/50 p-2">
          <p className="text-xs text-muted-foreground">Real Zero-Result Rate</p>
          <p className={cn('text-lg font-semibold', getRealZeroResultColor(realRate))}>
            {formatPercent(realRate)}
          </p>
          <p className="text-[10px] text-muted-foreground">After retry dedup</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-2">
          <p className="text-xs text-muted-foreground">Apparent Rate</p>
          <p className="text-lg font-semibold text-muted-foreground">{formatPercent(apparentRate)}</p>
          <p className="text-[10px] text-muted-foreground">Raw (inflated)</p>
        </div>
      </div>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total Searches</span>
          <span>{formatNumber(data.totalSearches)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Retries</span>
          <span>{formatNumber(data.retryCount)} ({formatPercent(data.retryRate)})</span>
        </div>
      </div>
      {data.topZeroResultQueries?.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Top zero-result queries</p>
          {data.topZeroResultQueries.slice(0, 5).map((q, idx) => (
            <div key={idx} className="flex items-center gap-2 text-sm">
              <AlertCircle className="h-3 w-3 text-red-400" />
              <span className="flex-1 truncate">&quot;{q.query}&quot;</span>
              <Badge variant="destructive" className="text-xs">{q.count}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// AI EFFECTIVENESS COMPONENT
// ============================================================================

interface AIEffectivenessData {
  totalConversations: number;
  successRate: number;
  retryRate: number;
  outcomes: Record<string, number>;
  decisions: Record<string, number>;
  presetDistribution: Array<{ preset: string; count: number; percentage: number }>;
  avgDurationMs: number;
  empty?: boolean;
}

function AIEffectivenessRenderer({ data }: { data: AIEffectivenessData }) {
  if (data.empty || data.totalConversations === 0) {
    return (
      <div className="flex items-center gap-2 py-2 text-muted-foreground">
        <AlertCircle className="h-4 w-4 text-amber-500" />
        <span className="text-sm">No AI effectiveness data available</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-muted/50 p-2 text-center">
          <p className="text-xs text-muted-foreground">Success</p>
          <p className={cn('text-lg font-semibold', getSuccessRateColor(data.successRate))}>
            {formatPercent(data.successRate)}
          </p>
        </div>
        <div className="rounded-lg bg-muted/50 p-2 text-center">
          <p className="text-xs text-muted-foreground">Retries</p>
          <p className="text-lg font-semibold">{formatPercent(data.retryRate)}</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-2 text-center">
          <p className="text-xs text-muted-foreground">Conversations</p>
          <p className="text-lg font-semibold">{formatNumber(data.totalConversations)}</p>
        </div>
      </div>
      <div className="space-y-1 text-sm">
        <p className="text-xs font-medium text-muted-foreground">Outcomes</p>
        {Object.entries(data.outcomes || {}).filter(([, v]) => v > 0).map(([key, val]) => (
          <div key={key} className="flex justify-between text-xs">
            <span className="text-muted-foreground">{key.replace(/_/g, ' ')}</span>
            <span>{val}</span>
          </div>
        ))}
      </div>
      <div className="text-xs text-muted-foreground">
        Avg duration: {formatDuration(data.avgDurationMs)}
      </div>
    </div>
  );
}

// ============================================================================
// DEMAND SIGNALS COMPONENT
// ============================================================================

interface DemandSignalsData {
  topBrands: Array<{ name: string; count: number }>;
  topCategories: Array<{ name: string; count: number }>;
  topQueries: Array<{ query: string; count: number }>;
  empty?: boolean;
}

function DemandSignalRenderer({ data }: { data: DemandSignalsData }) {
  const hasData = !data.empty && (
    (data.topBrands?.length > 0) ||
    (data.topCategories?.length > 0) ||
    (data.topQueries?.length > 0)
  );

  if (!hasData) {
    return (
      <div className="flex items-center gap-2 py-2 text-muted-foreground">
        <AlertCircle className="h-4 w-4 text-amber-500" />
        <span className="text-sm">No demand signal data available. Brand and category filters may not be in use yet.</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.topBrands?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Top Brands</p>
          <div className="space-y-1">
            {data.topBrands.slice(0, 5).map((b, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm">
                <TrendingUp className="h-3 w-3 text-blue-500" />
                <span className="flex-1">{b.name}</span>
                <Badge variant="secondary" className="text-xs">{b.count}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
      {data.topCategories?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Top Categories</p>
          <div className="space-y-1">
            {data.topCategories.slice(0, 5).map((c, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm">
                <Layers className="h-3 w-3 text-indigo-500" />
                <span className="flex-1">{c.name}</span>
                <Badge variant="secondary" className="text-xs">{c.count}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
      {data.topQueries?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Top Search Queries</p>
          <div className="space-y-1">
            {data.topQueries.slice(0, 8).map((q, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm">
                <Search className="h-3 w-3 text-emerald-500" />
                <span className="flex-1 truncate">{q.query}</span>
                <Badge variant="secondary" className="text-xs">{q.count}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// COST ANALYSIS COMPONENT
// ============================================================================

interface CostAnalysisData {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalConversations: number;
  avgTokensPerConversation: number;
  maxTokensPerConversation: number;
  retryTokenWaste: number;
  retryWastePercentage: number;
  empty?: boolean;
}

function CostAnalysisRenderer({ data }: { data: CostAnalysisData }) {
  if (data.empty || data.totalTokens === 0) {
    return (
      <div className="flex items-center gap-2 py-2 text-muted-foreground">
        <AlertCircle className="h-4 w-4 text-amber-500" />
        <span className="text-sm">No cost data available</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-muted/50 p-2">
          <div className="flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-xs text-muted-foreground">Total Tokens</span>
          </div>
          <p className="text-lg font-semibold">{formatNumber(data.totalTokens)}</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-2">
          <div className="flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5 text-green-500" />
            <span className="text-xs text-muted-foreground">Conversations</span>
          </div>
          <p className="text-lg font-semibold">{formatNumber(data.totalConversations)}</p>
        </div>
      </div>
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Input / Output</span>
          <span className="text-xs">{formatNumber(data.totalInputTokens)} / {formatNumber(data.totalOutputTokens)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Avg per conversation</span>
          <span>{formatNumber(data.avgTokensPerConversation)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Max single conversation</span>
          <span>{formatNumber(data.maxTokensPerConversation)}</span>
        </div>
        {data.retryTokenWaste > 0 && (
          <div className="flex justify-between text-amber-600">
            <span>Retry waste</span>
            <span>{formatNumber(data.retryTokenWaste)} ({formatPercent(data.retryWastePercentage)})</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// PROACTIVE INSIGHTS COMPONENT
// ============================================================================

interface ProactiveInsightItem {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  category: string;
  title: string;
  description: string;
  metric?: string;
  suggestedAction?: string;
}

interface ProactiveInsightsData {
  insights: ProactiveInsightItem[];
  empty?: boolean;
}

function ProactiveInsightsRenderer({ data }: { data: ProactiveInsightsData }) {
  if (data.empty || !data.insights || data.insights.length === 0) {
    return (
      <div className="flex items-center gap-2 py-2 text-green-600">
        <CheckCircle2 className="h-4 w-4" />
        <span className="text-sm">No notable issues detected. Everything looks healthy!</span>
      </div>
    );
  }

  const severityStyles = {
    critical: 'border-l-red-500',
    warning: 'border-l-amber-500',
    info: 'border-l-blue-500',
  };

  const severityLabels = {
    critical: { text: 'Critical', className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
    warning: { text: 'Warning', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' },
    info: { text: 'Info', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  };

  return (
    <div className="space-y-2.5">
      {data.insights.slice(0, 6).map((insight) => (
        <div key={insight.id} className={cn('rounded-lg border border-l-4 p-3', severityStyles[insight.severity])}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium">{insight.title}</span>
                <Badge className={cn('text-[10px] px-1.5 py-0 border-0', severityLabels[insight.severity].className)}>
                  {severityLabels[insight.severity].text}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{insight.description}</p>
              {insight.suggestedAction && (
                <div className="flex items-center gap-1.5 mt-2 text-xs text-violet-600 dark:text-violet-400">
                  <ArrowRight className="h-3 w-3 shrink-0" />
                  <span>{insight.suggestedAction}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// GUARDRAIL ANALYTICS COMPONENT
// ============================================================================

interface GuardrailData {
  totalClassified: number;
  classificationDistribution: Array<{ classification: string; count: number; percentage: number }>;
  blockedCount: number;
  blockedRate: number;
  avgDomainSimilarity: number;
  empty?: boolean;
}

function GuardrailAnalyticsRenderer({ data }: { data: GuardrailData }) {
  if (data.empty || data.totalClassified === 0) {
    return (
      <div className="flex items-center gap-2 py-2 text-muted-foreground">
        <AlertCircle className="h-4 w-4 text-amber-500" />
        <span className="text-sm">No guardrail data available</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-muted/50 p-2">
          <p className="text-xs text-muted-foreground">Total Classified</p>
          <p className="text-lg font-semibold">{formatNumber(data.totalClassified)}</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-2">
          <p className="text-xs text-muted-foreground">Blocked</p>
          <p className={cn('text-lg font-semibold', data.blockedRate > getThresholds().insights.guardrailBlockInfo ? 'text-amber-600' : 'text-green-600')}>
            {data.blockedCount} ({formatPercent(data.blockedRate)})
          </p>
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Classification Distribution</p>
        {data.classificationDistribution?.map((d, idx) => (
          <div key={idx} className="flex items-center gap-2 text-sm">
            <ShieldCheck className="h-3 w-3 text-muted-foreground" />
            <span className="flex-1">{d.classification}</span>
            <span className="text-xs text-muted-foreground">{formatPercent(d.percentage)}</span>
            <Badge variant="secondary" className="text-xs">{d.count}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// CONVERSATION DETAIL COMPONENT
// ============================================================================

interface ConversationDetailData {
  traceId: string;
  spans: Array<{
    id: string;
    operationName: string;
    durationMs: number;
    statusCode: string;
    userMessage?: string;
    planReasoning?: string;
    outcome?: string;
    preset?: string;
    toolName?: string;
    toolSuccess?: string;
    resultCount?: number;
  }>;
}

function ConversationDetailRenderer({ data }: { data: ConversationDetailData }) {
  if (!data || !data.spans || data.spans.length === 0) {
    return (
      <div className="flex items-center gap-2 py-2 text-muted-foreground">
        <AlertCircle className="h-4 w-4 text-amber-500" />
        <span className="text-sm">No conversation data found</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground font-mono">Trace: {data.traceId.slice(0, 16)}...</p>
      {data.spans.map((span) => {
        const isOk = span.statusCode === 'OK';
        const isError = span.statusCode === 'ERROR';
        return (
          <div key={span.id} className={cn('rounded-lg border p-2', isError && 'border-red-200 dark:border-red-900')}>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-1.5">
                {isOk ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : isError ? <AlertCircle className="h-3 w-3 text-red-500" /> : <CircleDot className="h-3 w-3 text-muted-foreground" />}
                <span className="font-mono text-xs">{span.operationName}</span>
              </div>
              <span className="text-xs text-muted-foreground">{formatDuration(span.durationMs)}</span>
            </div>
            {span.userMessage && (
              <p className="mt-1 text-xs"><MessageSquare className="inline h-3 w-3 mr-1" />&quot;{span.userMessage.slice(0, 100)}&quot;</p>
            )}
            {span.toolName && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                <Wrench className="inline h-3 w-3 mr-1" />{span.toolName} → {span.toolSuccess === 'true' ? 'success' : 'failed'}
                {span.resultCount !== undefined && ` (${span.resultCount} results)`}
              </p>
            )}
            {span.outcome && <Badge variant="outline" className="mt-1 text-[10px]">{span.outcome}</Badge>}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// RECENT SEARCHES COMPONENT
// ============================================================================

interface RecentSearch {
  id: string;
  timestamp: string;
  query: string;
  searchType: string;
  triggerType: string;
  totalResults: number;
  durationMs: number;
  success: boolean;
}

function RecentSearchesRenderer({ data }: { data: RecentSearch[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center gap-2 py-2 text-muted-foreground">
        <AlertCircle className="h-4 w-4 text-amber-500" />
        <span className="text-sm">No recent searches found</span>
      </div>
    );
  }

  const recentSearches = data.slice(0, 5);

  return (
    <div className="space-y-1.5">
      {recentSearches.map((search) => (
        <div
          key={search.id}
          className={cn(
            'flex items-center gap-2 rounded-md px-2 py-1.5',
            search.success ? 'bg-muted/30' : 'bg-red-50/50 dark:bg-red-950/30'
          )}
        >
          {search.success ? (
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
          )}
          <span className="min-w-0 flex-1 truncate text-sm">{search.query}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {search.totalResults} results
          </span>
          <Badge variant="outline" className="shrink-0 text-xs">
            {search.triggerType}
          </Badge>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// QUERY SEARCH EVENTS
// ============================================================================

interface QuerySearchEvent {
  id: string;
  timestamp: string;
  query: string;
  searchType: string;
  triggerType: string;
  totalResults: number;
  isZeroResult: boolean;
  durationMs: number;
  success: boolean;
  hasFilters: boolean;
  filterFields?: string[];
}

function QuerySearchEventsRenderer({ data }: { data: QuerySearchEvent[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center gap-2 py-2 text-muted-foreground">
        <AlertCircle className="h-4 w-4 text-amber-500" />
        <span className="text-sm">No search events found for this query</span>
      </div>
    );
  }

  const total = data.length;
  const zeroResults = data.filter((e) => e.isZeroResult).length;
  const withFilters = data.filter((e) => e.hasFilters).length;
  const avgDuration = Math.round(data.reduce((sum, e) => sum + e.durationMs, 0) / total);

  return (
    <div className="space-y-3">
      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-2">
        <div className="rounded-md bg-muted/50 px-2 py-1.5 text-center">
          <div className="text-sm font-semibold">{total}</div>
          <div className="text-[10px] text-muted-foreground">Events</div>
        </div>
        <div className={cn('rounded-md px-2 py-1.5 text-center', zeroResults > 0 ? 'bg-red-50 dark:bg-red-950/30' : 'bg-emerald-50 dark:bg-emerald-950/30')}>
          <div className={cn('text-sm font-semibold', zeroResults > 0 ? 'text-red-600' : 'text-emerald-600')}>{zeroResults}</div>
          <div className="text-[10px] text-muted-foreground">Zero Results</div>
        </div>
        <div className="rounded-md bg-muted/50 px-2 py-1.5 text-center">
          <div className="text-sm font-semibold">{withFilters}</div>
          <div className="text-[10px] text-muted-foreground">With Filters</div>
        </div>
        <div className="rounded-md bg-muted/50 px-2 py-1.5 text-center">
          <div className="text-sm font-semibold">{avgDuration}ms</div>
          <div className="text-[10px] text-muted-foreground">Avg Latency</div>
        </div>
      </div>

      {/* Event list */}
      <div className="space-y-1">
        {data.slice(0, 10).map((event) => (
          <div
            key={event.id}
            className={cn(
              'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs',
              event.isZeroResult ? 'bg-red-50/50 dark:bg-red-950/20' : 'bg-muted/30'
            )}
          >
            {event.success && !event.isZeroResult ? (
              <Search className="h-3 w-3 shrink-0 text-emerald-500" />
            ) : (
              <AlertCircle className="h-3 w-3 shrink-0 text-red-500" />
            )}
            <span className="shrink-0 text-muted-foreground" title={event.timestamp}>
              {new Date(event.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <Badge variant="outline" className="shrink-0 text-[10px] px-1 py-0">
              {event.triggerType}
            </Badge>
            <Badge variant="outline" className="shrink-0 text-[10px] px-1 py-0">
              {event.searchType}
            </Badge>
            <span className="shrink-0 tabular-nums">
              {event.totalResults} results
            </span>
            <span className="shrink-0 text-muted-foreground tabular-nums">
              {event.durationMs}ms
            </span>
            {event.hasFilters && (
              <Badge variant="secondary" className="shrink-0 text-[10px] px-1 py-0">
                filtered
              </Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN RENDERER
// ============================================================================

function renderDataBlock(block: AnalyticsDataBlock): React.ReactNode {
  const { dataType, data } = block;

  switch (dataType) {
    case 'overview_metrics':
      return <OverviewMetricsRenderer data={data as OverviewMetrics} />;
    case 'search_trends':
      return <SearchTrendsRenderer data={data as SearchTrendPoint[]} />;
    case 'popular_queries':
      return <PopularQueriesRenderer data={data as PopularQuery[]} />;
    case 'zero_result_queries':
      return <ZeroResultQueriesRenderer data={data as ZeroResultQuery[]} />;
    case 'search_type_breakdown':
      return <SearchTypeBreakdownRenderer data={data as SearchTypeBreakdown} />;
    case 'performance_metrics':
      return <PerformanceMetricsRenderer data={data as PerformanceMetrics} />;
    case 'customer_intents':
      return <CustomerIntentRenderer data={data as CustomerIntentsData} />;
    case 'catalog_health':
      return <CatalogHealthRenderer data={data as CatalogHealthData} />;
    case 'ai_effectiveness':
      return <AIEffectivenessRenderer data={data as AIEffectivenessData} />;
    case 'demand_signals':
      return <DemandSignalRenderer data={data as DemandSignalsData} />;
    case 'cost_analysis':
      return <CostAnalysisRenderer data={data as CostAnalysisData} />;
    case 'proactive_insights':
      return <ProactiveInsightsRenderer data={data as ProactiveInsightsData} />;
    case 'guardrail_analytics':
      return <GuardrailAnalyticsRenderer data={data as GuardrailData} />;
    case 'conversation_detail':
      return <ConversationDetailRenderer data={data as ConversationDetailData} />;
    case 'recent_searches':
      return <RecentSearchesRenderer data={data as RecentSearch[]} />;
    case 'query_search_events':
      return <QuerySearchEventsRenderer data={data as QuerySearchEvent[]} />;
    default:
      return null;
  }
}

function getBlockTitle(dataType: string): string {
  switch (dataType) {
    case 'overview_metrics':
      return 'Overview';
    case 'search_trends':
      return 'Search Trends';
    case 'popular_queries':
      return 'Popular Queries';
    case 'zero_result_queries':
      return 'Zero Result Queries';
    case 'search_type_breakdown':
      return 'Search Types';
    case 'performance_metrics':
      return 'Performance';
    case 'customer_intents':
      return 'Customer Intents';
    case 'catalog_health':
      return 'Catalog Health';
    case 'ai_effectiveness':
      return 'AI Effectiveness';
    case 'demand_signals':
      return 'Demand Signals';
    case 'cost_analysis':
      return 'Cost Analysis';
    case 'proactive_insights':
      return 'Key Insights';
    case 'guardrail_analytics':
      return 'Guardrail Analytics';
    case 'conversation_detail':
      return 'Conversation Detail';
    case 'recent_searches':
      return 'Recent Searches';
    case 'query_search_events':
      return 'Query Analysis';
    default:
      return 'Data';
  }
}

function DataBlockCard({ block }: { block: AnalyticsDataBlock }) {
  const content = renderDataBlock(block);

  // Don't render card if content is null (empty data)
  if (content === null) {
    return null;
  }

  return (
    <Card className="border-violet-200 dark:border-violet-800">
      <CardHeader className="pb-2 pt-3 px-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <div className="rounded bg-violet-100 p-1 dark:bg-violet-900">
            <Activity className="h-3 w-3 text-violet-600 dark:text-violet-400" />
          </div>
          {getBlockTitle(block.dataType)}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        {content}
      </CardContent>
    </Card>
  );
}

export function AnalyticsDataRenderer({ dataBlocks }: AnalyticsDataRendererProps) {
  if (!dataBlocks || dataBlocks.length === 0) {
    return null;
  }

  return (
    <div className="my-3 space-y-3">
      {dataBlocks.map((block, idx) => (
        <DataBlockCard key={`${block.dataType}-${idx}`} block={block} />
      ))}
    </div>
  );
}

export default AnalyticsDataRenderer;
