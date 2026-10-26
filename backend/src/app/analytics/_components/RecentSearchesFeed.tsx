// app/analytics/_components/RecentSearchesFeed.tsx

'use client';

import { CircleAlert, History } from 'lucide-react';

import type { RecentSearchEvent } from '../_lib/hooks/useAnalytics';

import { isBrowseQuery } from './sections/dashboard-cards';
import { ChartCard, formatCompact, formatMs } from './viz';

interface RecentSearchesFeedProps {
  data?: RecentSearchEvent[];
  isLoading?: boolean;
  refreshing?: boolean;
}

const TRIGGER_LABEL: Record<string, string> = {
  user: 'Visitor',
  ai_tool: 'AI assistant',
  ai_rag: 'AI context lookup',
  system: 'Automatic',
};

const timeFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** The latest searches in the selected period, newest first, one line each */
export function RecentSearchesFeed({ data, isLoading, refreshing }: RecentSearchesFeedProps) {
  const rows = data ?? [];
  return (
    <ChartCard
      title="Latest searches"
      description="The 10 most recent in this period, newest first"
      icon={History}
      loading={isLoading}
      refreshing={refreshing}
      skeletonHeight={200}
      empty={rows.length === 0 ? 'No searches in this period' : undefined}
    >
      <div className="-mx-2 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="px-2 pb-2 font-normal">Search</th>
              <th className="px-2 pb-2 font-normal">By</th>
              <th className="px-2 pb-2 text-right font-normal">Results</th>
              <th className="px-2 pb-2 text-right font-normal">Time</th>
              <th className="px-2 pb-2 text-right font-normal">When</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((event) => (
              <tr key={event.id} className="border-t border-border/50">
                <td className="max-w-[16rem] truncate px-2 py-2" title={event.query}>
                  {isBrowseQuery(event.query) ? (
                    <span className="italic text-muted-foreground">(browse all)</span>
                  ) : (
                    event.query
                  )}
                  <span className="ml-1.5 text-xs text-muted-foreground">{event.searchType}</span>
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">
                  {TRIGGER_LABEL[event.triggerType] ?? event.triggerType}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                  {event.totalResults === 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <CircleAlert className="size-3.5 text-viz-critical" aria-hidden /> None
                    </span>
                  ) : (
                    formatCompact(event.totalResults)
                  )}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-muted-foreground">
                  {formatMs(event.durationMs)}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-right text-muted-foreground">
                  {timeFmt.format(new Date(event.timestamp))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}
