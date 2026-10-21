'use client';

import { Bot, AlertCircle, MessageSquare, Search, Sparkles, Wrench, type LucideIcon } from 'lucide-react';
import { Fragment } from 'react';

import type { SpanListItem } from '../_lib/api-client';
import { traceFacts } from '../_lib/trace-facts';
import { traceContent, traceMessage } from '../_lib/trace-message';
import { traceStatus } from '../_lib/trace-status';

import { EmptyMessage, NotStored } from './NotStored';
import { humanizeOpName } from './SpanDetailPanel';

import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getDurationColor } from '@/features/analytics/analytics-thresholds';
import { cn } from '@/lib/utils';

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

/** What a request-level trace is, shown as a coloured tag at the start of the row. */
const TRACE_KINDS: Record<string, { label: string; icon: LucideIcon; className: string }> = {
  'chat.ai_experience.turn': {
    label: 'Chat',
    icon: MessageSquare,
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  },
  'search_experience.search': {
    label: 'Search',
    icon: Search,
    className: 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300',
  },
  'search_experience.summary': {
    label: 'AI summary',
    icon: Sparkles,
    className: 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300',
  },
};

export function SpanList({ spans, selectedSpanId, onSelectSpan }: SpanListProps) {
  if (spans.length === 0) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <Bot className="size-8 opacity-30" />
        <p>No traces yet.</p>
        <p className="text-xs">Chat with an AI Experience or search a Search Experience to see it here.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="divide-y">
        {spans.map((span) => {
          const status = traceStatus(span);
          const isError = status === 'error';
          const isSelected = span.id === selectedSpanId;
          const message = traceMessage(span.userMessage);
          const experience = span.experienceSlug ?? span.experienceType ?? null;
          const kind = TRACE_KINDS[span.operationName];
          const facts = traceFacts(span);

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
                  <span className={cn('block size-2.5 rounded-full mt-0.5', status === 'cancelled' ? 'bg-muted-foreground/40' : 'bg-green-500')} />
                )}
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                {/* Kind tag + message preview */}
                <div className="flex items-center gap-2 min-w-0">
                  {kind && (
                    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium', kind.className)}>
                      <kind.icon className="size-3" />
                      {kind.label}
                    </span>
                  )}
                  {/* Fills the rest of the row: sized to its text, truncation would clip an italic last letter */}
                  <p className={cn(
                    'min-w-0 flex-1 truncate pr-0.5 text-sm font-medium leading-snug',
                    isError && 'text-destructive',
                  )}>
                    {message.kind === 'text'
                      ? (message.text.length > 72 ? message.text.slice(0, 72) + '…' : message.text)
                      : !kind
                        ? <span className="italic font-normal text-muted-foreground">{humanizeOpName(span.operationName)} · no message recorded</span>
                        : message.kind === 'empty'
                          ? <EmptyMessage content={traceContent(span.operationName)} />
                          : <NotStored content={traceContent(span.operationName)} />
                    }
                  </p>
                </div>

                {/* Subline: experience, facts, time */}
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  {experience && (
                    <>
                      <Wrench className="size-3 shrink-0" />
                      <span className="truncate font-mono">{experience}</span>
                      <span className="text-muted-foreground/40">·</span>
                    </>
                  )}
                  {facts.map((fact) => (
                    <Fragment key={fact}>
                      <span className="shrink-0 font-mono">{fact}</span>
                      <span className="text-muted-foreground/40">·</span>
                    </Fragment>
                  ))}
                  <span className="shrink-0">{relativeTime(span.startTime)}</span>
                  {status === 'cancelled' && (
                    <Badge variant="secondary" className="text-[10px]">Cancelled</Badge>
                  )}
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
