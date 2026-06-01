// app/analytics/_components/PerformanceCard.tsx

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/components/card';
import { Skeleton } from '@/shared/ui/components/skeleton';
import { getLatencyColor, getThresholds } from '@/features/analytics/analytics-thresholds';
import type { PerformanceMetrics } from '../_lib/hooks/useAnalytics';

interface PerformanceCardProps {
  data?: PerformanceMetrics;
  isLoading?: boolean;
}

function formatMs(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  return `${Math.round(ms)}ms`;
}

export function PerformanceCard({ data, isLoading }: PerformanceCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Performance</CardTitle>
          <CardDescription>Search latency percentiles</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-2 w-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  const t = getThresholds();

  const getPercentage = (value: number) => {
    // Invert: lower is better, scale to 2x the acceptable threshold
    const maxDisplay = t.latency.acceptable * 2;
    const clamped = Math.min(value, maxDisplay);
    return 100 - (clamped / maxDisplay) * 100;
  };

  const metrics = [
    { label: 'Average', value: data.avgDurationMs },
    { label: 'p50 (Median)', value: data.p50DurationMs },
    { label: 'p95', value: data.p95DurationMs },
    { label: 'p99', value: data.p99DurationMs },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance</CardTitle>
        <CardDescription>Search latency percentiles</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {metrics.map((metric) => (
            <div key={metric.label} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{metric.label}</span>
                <span className="font-medium">{formatMs(metric.value)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className={`h-full transition-all ${getLatencyColor(metric.value, t)}`}
                  style={{ width: `${getPercentage(metric.value)}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {(data.avgEsDurationMs > 0 || data.avgEmbeddingDurationMs > 0) && (
          <div className="mt-6 border-t pt-4">
            <h4 className="mb-3 text-sm font-medium">Breakdown</h4>
            <div className="space-y-2 text-sm">
              {data.avgEsDurationMs > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Elasticsearch</span>
                  <span>{formatMs(data.avgEsDurationMs)}</span>
                </div>
              )}
              {data.avgEmbeddingDurationMs > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Embedding Generation</span>
                  <span>{formatMs(data.avgEmbeddingDurationMs)}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
