// app/analytics/_components/ZeroResultsTable.tsx

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/components/card';
import { Skeleton } from '@/shared/ui/components/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/components/table';
import { AlertTriangle } from 'lucide-react';
import type { ZeroResultQuery } from '../_lib/hooks/useAnalytics';

interface ZeroResultsTableProps {
  data?: ZeroResultQuery[];
  isLoading?: boolean;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ZeroResultsTable({ data, isLoading }: ZeroResultsTableProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Zero Result Queries
          </CardTitle>
          <CardDescription>Content gaps that need attention</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Zero Result Queries
          </CardTitle>
          <CardDescription>Content gaps that need attention</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-[200px] items-center justify-center text-muted-foreground">
            No zero result queries recorded
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          Zero Result Queries
        </CardTitle>
        <CardDescription>Content gaps that need attention</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Query</TableHead>
              <TableHead className="text-right">Occurrences</TableHead>
              <TableHead>Last Seen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((query) => (
              <TableRow key={query.query}>
                <TableCell className="max-w-[250px] truncate font-medium" title={query.query}>
                  {query.query}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {query.occurrenceCount.toLocaleString()}
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDate(query.lastSeen)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
