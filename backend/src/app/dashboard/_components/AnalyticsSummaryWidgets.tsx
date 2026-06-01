// app/dashboard/_components/AnalyticsSummaryWidgets.tsx

'use client';

import Link from 'next/link';
import {
  Search,
  Target,
  Zap,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  BarChart3,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { getThresholds } from '@/features/analytics/analytics-thresholds';
import type { AnalyticsSummary } from '../_lib/hooks/useDashboardData';

// ============================================================================
// HELPERS
// ============================================================================

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function getSuccessVariant(rate: number): 'success' | 'warning' | 'error' {
  const t = getThresholds();
  if (rate >= t.successRate.excellent) return 'success';
  if (rate >= t.successRate.good) return 'warning';
  return 'error';
}

function getSpeedVariant(ms: number): 'success' | 'warning' | 'error' {
  const t = getThresholds();
  if (ms < t.latency.excellent) return 'success';
  if (ms < t.latency.acceptable) return 'warning';
  return 'error';
}

// ============================================================================
// INSIGHT CARD
// ============================================================================

interface InsightCardProps {
  title: string;
  value: string;
  description: string;
  icon: React.ElementType;
  variant: 'success' | 'warning' | 'error' | 'default';
  trend?: { value: string; direction: 'up' | 'down' | 'neutral' };
  chart?: React.ReactNode;
}

function InsightCard({
  title,
  value,
  description,
  icon: Icon,
  variant,
  trend,
  chart,
}: InsightCardProps) {
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
    <div
      className={`relative overflow-hidden rounded-2xl border p-6 ${style.bg} ${style.border}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`rounded-xl p-2.5 ${style.iconBg}`}>
            <Icon className={`size-5 ${style.iconColor}`} />
          </div>
          <span className="text-sm font-medium text-muted-foreground">{title}</span>
        </div>
        {trend && (
          <div
            className={`flex items-center gap-1 text-sm font-semibold ${
              trend.direction === 'up'
                ? style.trendUp
                : trend.direction === 'down'
                  ? style.trendDown
                  : 'text-muted-foreground'
            }`}
          >
            {trend.direction === 'up' ? (
              <TrendingUp className="size-4" />
            ) : trend.direction === 'down' ? (
              <TrendingDown className="size-4" />
            ) : null}
            {trend.value}
          </div>
        )}
      </div>
      <div className="mt-4">
        <p className="text-4xl font-bold tracking-tight">{value}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {chart && <div className="mt-4">{chart}</div>}
    </div>
  );
}

// ============================================================================
// MINI SPARKLINE
// ============================================================================

interface MiniSparklineProps {
  data: Array<{ timestamp: string; totalSearches: number }>;
}

function MiniSparkline({ data }: MiniSparklineProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-[60px] items-center justify-center text-xs text-muted-foreground">
        No trend data
      </div>
    );
  }

  const chartData = data.slice(-12).map((d) => ({
    value: d.totalSearches,
  }));

  return (
    <div className="h-[60px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <defs>
            <linearGradient id="sparklineGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            labelFormatter={() => ''}
            formatter={(value: number) => [formatNumber(value), 'Searches']}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#6366f1"
            fill="url(#sparklineGradient)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================================
// ANALYTICS SUMMARY WIDGETS
// ============================================================================

interface AnalyticsSummaryWidgetsProps {
  analytics: AnalyticsSummary;
}

export function AnalyticsSummaryWidgets({ analytics }: AnalyticsSummaryWidgetsProps) {
  const successVariant = getSuccessVariant(analytics.successRate);
  const speedVariant = getSpeedVariant(analytics.avgDurationMs);

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-500/15">
            <BarChart3 className="size-5 text-indigo-500" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Analytics Summary</h2>
            <p className="text-sm text-muted-foreground">Last 24 hours performance</p>
          </div>
        </div>
        <Link
          href="/analytics/overview"
          className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          View Details
          <ArrowRight className="size-4" />
        </Link>
      </div>

      {/* Widgets Grid */}
      <div className="grid gap-4 sm:grid-cols-3">
        <InsightCard
          title="Search Volume"
          value={formatNumber(analytics.totalSearches)}
          description={analytics.totalSearches > 0 ? 'Total searches today' : 'No searches yet'}
          icon={Search}
          variant="default"
          trend={
            analytics.totalSearches > 0
              ? { value: 'Active', direction: 'neutral' }
              : undefined
          }
          chart={<MiniSparkline data={analytics.trendData} />}
        />
        <InsightCard
          title="Success Rate"
          value={formatPercent(analytics.successRate)}
          description={
            analytics.successRate >= getThresholds().successRate.excellent
              ? 'Excellent search quality'
              : analytics.successRate >= getThresholds().successRate.good
                ? 'Good search quality'
                : 'Needs improvement'
          }
          icon={Target}
          variant={successVariant}
          trend={
            analytics.zeroResultRate > 0
              ? {
                  value: `${Math.round(analytics.zeroResultRate * 100)}% failed`,
                  direction: analytics.zeroResultRate > getThresholds().zeroResultRate.warning ? 'down' : 'neutral',
                }
              : undefined
          }
        />
        <InsightCard
          title="Avg Response Time"
          value={formatMs(analytics.avgDurationMs)}
          description={
            analytics.avgDurationMs < getThresholds().latency.excellent
              ? 'Excellent performance'
              : analytics.avgDurationMs < getThresholds().latency.acceptable
                ? 'Good performance'
                : 'Consider optimizing'
          }
          icon={Zap}
          variant={speedVariant}
          trend={
            analytics.avgDurationMs > 0
              ? {
                  value: analytics.avgDurationMs < getThresholds().latency.good ? 'Fast' : 'Normal',
                  direction: analytics.avgDurationMs < getThresholds().latency.good ? 'up' : 'neutral',
                }
              : undefined
          }
        />
      </div>
    </div>
  );
}
