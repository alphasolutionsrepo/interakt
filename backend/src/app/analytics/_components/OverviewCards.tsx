// app/analytics/_components/OverviewCards.tsx

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/components/card';
import { Skeleton } from '@/shared/ui/components/skeleton';
import { Search, Bot, Clock, TrendingUp, AlertCircle } from 'lucide-react';
import { getZeroResultStatus } from '@/features/analytics/analytics-thresholds';
import type { OverviewMetrics } from '../_lib/hooks/useAnalytics';

interface OverviewCardsProps {
  data?: OverviewMetrics;
  isLoading?: boolean;
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toLocaleString();
}

function formatDuration(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  return `${Math.round(ms)}ms`;
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export function OverviewCards({ data, isLoading }: OverviewCardsProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-7 w-20" />
              <Skeleton className="mt-1 h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const cards = [
    {
      title: 'Total Searches',
      value: formatNumber(data.totalSearches),
      subtext: `${formatNumber(data.uniqueQueries)} unique queries`,
      icon: Search,
      iconColor: 'text-blue-500',
    },
    {
      title: 'AI Requests',
      value: formatNumber(data.totalAIRequests),
      subtext: `User: ${formatNumber(data.searchesByTrigger.user)}, AI: ${formatNumber(data.searchesByTrigger.ai_tool + data.searchesByTrigger.ai_rag)}`,
      icon: Bot,
      iconColor: 'text-purple-500',
    },
    {
      title: 'Zero Result Rate',
      value: formatPercent(data.zeroResultRate),
      subtext: getZeroResultStatus(data.zeroResultRate).isWarning ? 'Consider content gaps' : 'Healthy',
      icon: getZeroResultStatus(data.zeroResultRate).isWarning ? AlertCircle : TrendingUp,
      iconColor: getZeroResultStatus(data.zeroResultRate).isWarning ? 'text-amber-500' : 'text-green-500',
    },
    {
      title: 'Avg Search Latency',
      value: formatDuration(data.avgSearchDurationMs),
      subtext: `AI avg: ${formatDuration(data.avgAIDurationMs)}`,
      icon: Clock,
      iconColor: 'text-orange-500',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
            <card.icon className={`h-4 w-4 ${card.iconColor}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
            <p className="text-xs text-muted-foreground">{card.subtext}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
