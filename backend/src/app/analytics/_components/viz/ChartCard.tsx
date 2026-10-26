// app/analytics/_components/viz/ChartCard.tsx

'use client';

import { useId, useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/components/card';
import { Skeleton } from '@/shared/ui/components/skeleton';

// ============================================================================
// TYPES
// ============================================================================

export interface ChartTable {
  columns: Array<{ key: string; label: string; align?: 'left' | 'right' }>;
  rows: Array<Record<string, ReactNode>>;
}

interface ChartCardProps {
  title: string;
  description?: string;
  icon?: React.ElementType;
  /** First load: show a skeleton of this height instead of the content */
  loading?: boolean;
  /** Refetching: keep the current chart, dimmed, so nothing jumps */
  refreshing?: boolean;
  /** Same data as a table. Adds a Chart / Table switch to the header. */
  table?: ChartTable;
  /** Shown instead of the content when there is nothing to draw */
  empty?: ReactNode;
  skeletonHeight?: number;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ChartCard({
  title,
  description,
  icon: Icon,
  loading,
  refreshing,
  table,
  empty,
  skeletonHeight = 240,
  actions,
  className,
  children,
}: ChartCardProps) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const id = useId();
  const showTable = view === 'table' && table && !empty;

  return (
    <Card className={cn('gap-4 rounded-2xl border-border/60 shadow-sm', className)} aria-labelledby={`${id}-title`}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="min-w-0 space-y-1">
          <CardTitle id={`${id}-title`} className="flex items-center gap-2 text-base font-semibold">
            {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
            {title}
          </CardTitle>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          {table && !empty && !loading && (
            <div className="flex rounded-lg border p-0.5 text-xs" role="group" aria-label={`${title}: view as`}>
              {(['chart', 'table'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={view === option}
                  onClick={() => setView(option)}
                  className={cn(
                    'rounded-md px-2 py-1 capitalize transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                    view === option ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className={cn('transition-opacity', refreshing && !loading && 'opacity-60')}>
        {loading ? (
          <Skeleton className="w-full rounded-xl" style={{ height: skeletonHeight }} />
        ) : empty ? (
          <div
            className="flex items-center justify-center text-center text-sm text-muted-foreground"
            style={{ minHeight: Math.min(skeletonHeight, 160) }}
          >
            {empty}
          </div>
        ) : showTable ? (
          <DataTable table={table} />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

function DataTable({ table }: { table: ChartTable }) {
  return (
    <div className="max-h-[320px] overflow-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
          <tr>
            {table.columns.map((col) => (
              <th key={col.key} scope="col" className={cn('px-3 py-2 font-medium', col.align === 'right' ? 'text-right' : 'text-left')}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {table.rows.map((row, i) => (
            <tr key={i} className="border-t">
              {table.columns.map((col) => (
                <td key={col.key} className={cn('px-3 py-1.5', col.align === 'right' ? 'text-right' : 'text-left')}>
                  {row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
