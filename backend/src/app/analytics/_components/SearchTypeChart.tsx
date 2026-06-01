// app/analytics/_components/SearchTypeChart.tsx

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/components/card';
import { Skeleton } from '@/shared/ui/components/skeleton';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import type { SearchTypeBreakdown } from '../_lib/hooks/useAnalytics';

interface SearchTypeChartProps {
  data?: SearchTypeBreakdown;
  isLoading?: boolean;
}

const COLORS = {
  lexical: 'hsl(217, 91%, 60%)', // Blue
  semantic: 'hsl(142, 71%, 45%)', // Green
  hybrid: 'hsl(262, 83%, 58%)', // Purple
};

export function SearchTypeChart({ data, isLoading }: SearchTypeChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Search Types</CardTitle>
          <CardDescription>Distribution by search method</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="mx-auto h-[200px] w-[200px] rounded-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  const total = data.lexical + data.semantic + data.hybrid;

  if (total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Search Types</CardTitle>
          <CardDescription>Distribution by search method</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-[200px] items-center justify-center text-muted-foreground">
            No searches recorded
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = [
    { name: 'Lexical', value: data.lexical, color: COLORS.lexical },
    { name: 'Semantic', value: data.semantic, color: COLORS.semantic },
    { name: 'Hybrid', value: data.hybrid, color: COLORS.hybrid },
  ].filter((item) => item.value > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Search Types</CardTitle>
        <CardDescription>Distribution by search method</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={40}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => [
                `${value.toLocaleString()} (${((value / total) * 100).toFixed(1)}%)`,
                'Searches',
              ]}
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
              }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
