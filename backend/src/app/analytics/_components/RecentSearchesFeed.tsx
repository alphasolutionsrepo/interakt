// app/analytics/_components/RecentSearchesFeed.tsx

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/components/card';
import { Skeleton } from '@/shared/ui/components/skeleton';
import { Badge } from '@/shared/ui/components/badge';
import { ScrollArea } from '@/shared/ui/components/scroll-area';
import { Search, Bot, CheckCircle, XCircle } from 'lucide-react';
import type { RecentSearchEvent } from '../_lib/hooks/useAnalytics';

interface RecentSearchesFeedProps {
  data?: RecentSearchEvent[];
  isLoading?: boolean;
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (date.toDateString() === new Date().toDateString()) return `Today, ${time}`;
  return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`;
}

/** Names a step the way the admin knows it: the tool attached to the experience, or the AI feature */
const STEP_LABELS: Record<string, string> = {
  lookup: 'Find Record',
  enumerate: 'List Values',
  parameter_context: 'Filter values',
  query_interpretation: 'Query understanding',
  field_values_legacy: 'Field values (earlier)',
};

function getTriggerLabel(triggerType: string, triggerStep: string | null): string {
  switch (triggerType) {
    case 'user':
      return 'User search';
    case 'ai_tool':
      return !triggerStep || triggerStep === 'search' ? 'AI tool search' : `AI tool: ${STEP_LABELS[triggerStep] ?? triggerStep}`;
    case 'ai_step':
      return `AI step: ${STEP_LABELS[triggerStep ?? ''] ?? triggerStep ?? 'unknown'}`;
    default:
      return triggerType;
  }
}

/** Wildcard/empty queries are browse requests (e.g. a widget's initial load), not something a user typed */
function isBrowseQuery(query: string): boolean {
  const q = query.trim();
  return q === '' || q === '*';
}

function getTriggerIcon(triggerType: string) {
  switch (triggerType) {
    case 'ai_tool':
    case 'ai_step':
      return <Bot className="h-3 w-3" />;
    default:
      return <Search className="h-3 w-3" />;
  }
}

function getTriggerColor(triggerType: string) {
  switch (triggerType) {
    case 'user':
      return 'bg-blue-500/10 text-blue-500';
    case 'ai_tool':
    case 'ai_step':
      return 'bg-purple-500/10 text-purple-500';
    default:
      return 'bg-gray-500/10 text-gray-500';
  }
}

function getSearchTypeBadge(searchType: string) {
  const colors: Record<string, string> = {
    lexical: 'bg-blue-500/10 text-blue-600',
    semantic: 'bg-green-500/10 text-green-600',
    hybrid: 'bg-purple-500/10 text-purple-600',
  };
  return colors[searchType] || 'bg-gray-500/10 text-gray-600';
}

export function RecentSearchesFeed({ data, isLoading }: RecentSearchesFeedProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Searches</CardTitle>
          <CardDescription>Newest first</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
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
          <CardTitle>Recent Searches</CardTitle>
          <CardDescription>Newest first</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-[300px] items-center justify-center text-muted-foreground">
            No searches yet
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Searches</CardTitle>
        <CardDescription>Newest first</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          <div className="space-y-3">
            {data.map((event) => (
              <div
                key={event.id}
                className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
              >
                {/* Status indicator */}
                <div className="mt-0.5">
                  {event.success ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                </div>

                {/* Main content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${getTriggerColor(event.triggerType)}`}
                    >
                      {getTriggerIcon(event.triggerType)}
                      {getTriggerLabel(event.triggerType, event.triggerStep)}
                    </span>
                    <Badge variant="outline" className={`text-xs ${getSearchTypeBadge(event.searchType)}`}>
                      {event.searchType}
                    </Badge>
                  </div>

                  <p className="mt-1 truncate text-sm font-medium" title={event.query}>
                    {isBrowseQuery(event.query) ? <span className="italic text-muted-foreground">(browse all — no search term)</span> : <>&ldquo;{event.query}&rdquo;</>}
                  </p>

                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{event.totalResults.toLocaleString()} {event.totalResults === 1 ? 'result' : 'results'}</span>
                    <span>{event.durationMs}ms</span>
                  </div>
                </div>

                {/* Timestamp */}
                <div className="text-xs text-muted-foreground">{formatTime(event.timestamp)}</div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
