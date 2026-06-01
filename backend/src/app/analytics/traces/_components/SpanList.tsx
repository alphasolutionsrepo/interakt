'use client';

import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Bot, AlertCircle, Wrench } from 'lucide-react';
import { getDurationColor } from '@/features/analytics/analytics-thresholds';
import type { SpanListItem } from '../_lib/api-client';

interface SpanListProps {
  spans: SpanListItem[];
  selectedSpanId: string | null;
  onSelectSpan: (span: SpanListItem) => void;
}

function relativeTime(dateString: string): string {
  const diffSec = Math.round((Date.now() - new Date(dateString).getTime()) / 1000);
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${Math.round(diffHour / 24)}d ago`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function durationColor(ms: number): string {
  return getDurationColor(ms);
}

export function SpanList({ spans, selectedSpanId, onSelectSpan }: SpanListProps) {
  if (spans.length === 0) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <Bot className="size-8 opacity-30" />
        <p>No conversations yet.</p>
        <p className="text-xs">Start a chat in an AI Experience to see it here.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="divide-y">
        {spans.map((span) => {
          const isError = span.statusCode === 'ERROR';
          const isSelected = span.id === selectedSpanId;
          const message = span.userMessage?.trim();
          const experience = span.experienceSlug ?? span.experienceType ?? null;

          return (
            <button
              key={span.id}
              type="button"
              className={cn(
                'w-full text-left px-4 py-3.5 transition-colors hover:bg-muted/50 flex items-start gap-3',
                isSelected && 'bg-accent hover:bg-accent',
              )}
              onClick={() => onSelectSpan(span)}
            >
              {/* Status indicator */}
              <div className="mt-1 shrink-0">
                {isError ? (
                  <AlertCircle className="size-3.5 text-destructive" />
                ) : (
                  <span className="block size-2.5 rounded-full bg-green-500 mt-0.5" />
                )}
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                {/* Message preview */}
                <p className={cn(
                  'truncate text-sm font-medium leading-snug',
                  isError && 'text-destructive',
                )}>
                  {message
                    ? (message.length > 72 ? message.slice(0, 72) + '…' : message)
                    : <span className="italic text-muted-foreground">No message recorded</span>
                  }
                </p>

                {/* Subline: experience + time */}
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  {experience && (
                    <>
                      <Wrench className="size-3 shrink-0" />
                      <span className="truncate font-mono">{experience}</span>
                      <span className="text-muted-foreground/40">·</span>
                    </>
                  )}
                  <span>{relativeTime(span.startTime)}</span>
                </div>
              </div>

              {/* Duration */}
              <div className="shrink-0 text-right">
                <span className={cn('text-xs font-mono tabular-nums font-semibold', durationColor(span.durationMs))}>
                  {formatDuration(span.durationMs)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}
