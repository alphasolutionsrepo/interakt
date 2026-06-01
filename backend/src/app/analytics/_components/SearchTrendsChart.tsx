// app/analytics/_components/SearchTrendsChart.tsx

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/components/card';
import { Skeleton } from '@/shared/ui/components/skeleton';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { SearchTrendPoint } from '../_lib/hooks/useAnalytics';

interface SearchTrendsChartProps {
  data?: SearchTrendPoint[];
  isLoading?: boolean;
}

function formatDate(timestamp: string, showTime: boolean = true): string {
  const date = new Date(timestamp);
  if (showTime) {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function SearchTrendsChart({ data, isLoading }: SearchTrendsChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Search Trends</CardTitle>
          <CardDescription>Search volume and zero results over time</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Search Trends</CardTitle>
          <CardDescription>Search volume and zero results over time</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-[300px] items-center justify-center text-muted-foreground">
            No data available for the selected time range
          </div>
        </CardContent>
      </Card>
    );
  }

  // Determine if we should show time based on data range
  const firstDate = new Date(data[0].timestamp);
  const lastDate = new Date(data[data.length - 1].timestamp);
  const rangeHours = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60);
  const showTime = rangeHours <= 48;

  const chartData = data.map((point) => ({
    ...point,
    timestamp: formatDate(point.timestamp, showTime),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Search Trends</CardTitle>
        <CardDescription>Search volume and zero results over time</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="timestamp"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              className="text-muted-foreground"
            />
            <YAxis
              fontSize={12}
              tickLine={false}
              axisLine={false}
              className="text-muted-foreground"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
              }}
              labelStyle={{ color: 'hsl(var(--foreground))' }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="totalSearches"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={false}
              name="Total Searches"
            />
            <Line
              type="monotone"
              dataKey="uniqueQueries"
              stroke="hsl(217, 91%, 60%)"
              strokeWidth={2}
              dot={false}
              name="Unique Queries"
            />
            <Line
              type="monotone"
              dataKey="zeroResults"
              stroke="hsl(0, 84%, 60%)"
              strokeWidth={2}
              dot={false}
              name="Zero Results"
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
