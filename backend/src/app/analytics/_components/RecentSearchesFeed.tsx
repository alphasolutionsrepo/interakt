// app/analytics/_components/RecentSearchesFeed.tsx

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/components/card';
import { Skeleton } from '@/shared/ui/components/skeleton';
import { Badge } from '@/shared/ui/components/badge';
import { ScrollArea } from '@/shared/ui/components/scroll-area';
import { Search, Bot, Server, CheckCircle, XCircle } from 'lucide-react';
import type { RecentSearchEvent } from '../_lib/hooks/useAnalytics';

interface RecentSearchesFeedProps {
  data?: RecentSearchEvent[];
  isLoading?: boolean;
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getTriggerIcon(triggerType: string) {
  switch (triggerType) {
    case 'user':
      return <Search className="h-3 w-3" />;
    case 'ai_tool':
    case 'ai_rag':
      return <Bot className="h-3 w-3" />;
    case 'system':
      return <Server className="h-3 w-3" />;
    default:
      return <Search className="h-3 w-3" />;
  }
}

function getTriggerColor(triggerType: string) {
  switch (triggerType) {
    case 'user':
      return 'bg-blue-500/10 text-blue-500';
    case 'ai_tool':
    case 'ai_rag':
      return 'bg-purple-500/10 text-purple-500';
    case 'system':
      return 'bg-gray-500/10 text-gray-500';
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
          <CardTitle>Live Search Feed</CardTitle>
          <CardDescription>Real-time search activity</CardDescription>
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
          <CardTitle>Live Search Feed</CardTitle>
          <CardDescription>Real-time search activity</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-[300px] items-center justify-center text-muted-foreground">
            No recent searches
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live Search Feed</CardTitle>
        <CardDescription>Real-time search activity</CardDescription>
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
                      {event.triggerType}
                    </span>
                    <Badge variant="outline" className={`text-xs ${getSearchTypeBadge(event.searchType)}`}>
                      {event.searchType}
                    </Badge>
                  </div>

                  <p className="mt-1 truncate text-sm font-medium" title={event.query}>
                    &ldquo;{event.query}&rdquo;
                  </p>

                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{event.totalResults} results</span>
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
