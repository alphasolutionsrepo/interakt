// app/analytics/_components/PopularQueriesTable.tsx

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/components/card';
import { Skeleton } from '@/shared/ui/components/skeleton';
import { Badge } from '@/shared/ui/components/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/components/table';
import type { PopularQuery } from '../_lib/hooks/useAnalytics';

interface PopularQueriesTableProps {
  data?: PopularQuery[];
  isLoading?: boolean;
  showAll?: boolean;
}

export function PopularQueriesTable({ data, isLoading, showAll = false }: PopularQueriesTableProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Popular Queries</CardTitle>
          <CardDescription>Most searched terms</CardDescription>
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
          <CardTitle>Popular Queries</CardTitle>
          <CardDescription>Most searched terms</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-[200px] items-center justify-center text-muted-foreground">
            No queries recorded
          </div>
        </CardContent>
      </Card>
    );
  }

  const displayData = showAll ? data : data.slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Popular Queries</CardTitle>
        <CardDescription>Most searched terms</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">#</TableHead>
              <TableHead>Query</TableHead>
              <TableHead className="text-right">Searches</TableHead>
              <TableHead className="text-right">Avg Results</TableHead>
              <TableHead className="text-right">Zero Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayData.map((query, index) => (
              <TableRow key={query.query}>
                <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
                <TableCell className="max-w-[200px] truncate font-medium" title={query.query}>
                  {query.query}
                </TableCell>
                <TableCell className="text-right">{query.searchCount.toLocaleString()}</TableCell>
                <TableCell className="text-right">{query.avgResults.toFixed(1)}</TableCell>
                <TableCell className="text-right">
                  {query.zeroResultCount > 0 ? (
                    <Badge variant="destructive" className="text-xs">
                      {query.zeroResultCount}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
