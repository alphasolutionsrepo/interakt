// app/analytics/chat/_components/MessageBubble.tsx

'use client';

/**
 * One message in an analytics conversation: the question, or the answer with
 * its live progress, data cards, text and follow-up suggestions. Used by the
 * full chat page and the Ask panel.
 */

import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AlertCircle, CheckCircle2, Sparkles, User, Wrench } from 'lucide-react';

import type { ChatMessage } from '../../_lib/hooks/useAnalyticsChat';
import { AnalyticsDataRenderer } from './AnalyticsDataRenderer';

import { Badge } from '@/shared/ui/components/badge';
import { cn } from '@/lib/utils';

interface MessageBubbleProps {
  message: ChatMessage;
  onFollowUpClick?: (question: string) => void;
  streamingState?: {
    status?: string;
    activeTool?: string;
    toolsExecuted?: string[];
  };
}

export function MessageBubble({ message, onFollowUpClick, streamingState }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const hasContent = message.content && message.content.length > 0;
  const hasAnalyticsData = message.analyticsData && message.analyticsData.length > 0;
  // Show loading animation until text content starts streaming (analytics data can appear alongside)
  const isActivelyStreaming = message.isStreaming && !hasContent;

  // Get phase and phrases for streaming state
  const phase = streamingState ? getPhaseFromStatus(streamingState.status, streamingState.activeTool) : 'thinking';
  const phrases = streamingState?.activeTool && TOOL_PHRASES[streamingState.activeTool]
    ? TOOL_PHRASES[streamingState.activeTool]
    : LOADING_PHRASES[phase];
  const { phrase, isVisible } = useRotatingPhrase(phrases, 2500);

  return (
    <div className={cn('flex gap-3', isUser ? 'flex-row-reverse' : '')}>
      {/* Avatar */}
      <div className="relative flex size-9 shrink-0 items-center justify-center mt-0.5">
        {/* Pulsing ring for streaming state */}
        {message.isStreaming && !message.error && (
          <div
            className="absolute inset-0 animate-ping rounded-xl bg-violet-500/20 opacity-75"
            style={{ animationDuration: '2s' }}
          />
        )}
        <div
          className={cn(
            'relative flex size-9 items-center justify-center rounded-xl transition-all duration-300',
            isUser
              ? 'bg-primary text-primary-foreground'
              : message.error
                ? 'bg-red-100 dark:bg-red-900'
                : 'bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-900 dark:to-purple-900 shadow-sm'
          )}
        >
          {isUser ? (
            <User className="size-4" />
          ) : message.error ? (
            <AlertCircle className="size-4 text-red-600 dark:text-red-400" />
          ) : message.isStreaming ? (
            <Sparkles className="size-4 text-violet-600 dark:text-violet-400 animate-pulse" />
          ) : (
            <Sparkles className="size-4 text-violet-600 dark:text-violet-400" />
          )}
        </div>
      </div>

      {/* Content */}
      <div
        className={cn(
          'flex-1 max-w-[90%] min-w-0 rounded-2xl px-5 py-4 overflow-hidden transition-all duration-300',
          isUser
            ? 'bg-primary text-primary-foreground'
            : message.error
              ? 'border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/50'
              : 'bg-gradient-to-br from-muted/80 to-muted/40 shadow-sm'
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {message.content}
          </p>
        ) : (
          <div className="space-y-3">
            {/* Streaming status indicator - shows when no content yet */}
            {isActivelyStreaming && streamingState && (
              <div className="animate-in fade-in-0 duration-300">
                <div className="flex flex-col gap-2">
                  {/* Rotating phrase with fade animation */}
                  <div className="flex items-center gap-2">
                    <div className="flex gap-0.5">
                      <div className="size-1 rounded-full bg-violet-500 animate-[pulse_1s_ease-in-out_infinite]" />
                      <div className="size-1 rounded-full bg-violet-500 animate-[pulse_1s_ease-in-out_infinite_0.2s]" />
                      <div className="size-1 rounded-full bg-violet-500 animate-[pulse_1s_ease-in-out_infinite_0.4s]" />
                    </div>
                    <span
                      className={cn(
                        "text-sm font-medium text-foreground/80 transition-all duration-200",
                        isVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"
                      )}
                    >
                      {phrase}
                    </span>
                  </div>

                  {/* Active tool indicator */}
                  {streamingState.activeTool && (
                    <div className="flex items-center gap-2 animate-in slide-in-from-left-2 duration-300">
                      <div className="flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5">
                        <div className="relative">
                          <Wrench className="size-2.5 text-violet-600 dark:text-violet-400" />
                          <div className="absolute inset-0 animate-ping">
                            <Wrench className="size-2.5 text-violet-600/50 dark:text-violet-400/50" />
                          </div>
                        </div>
                        <span className="text-xs font-medium text-violet-600 dark:text-violet-400">
                          {streamingState.activeTool.replace(/_/g, ' ').replace(/^get /, '')}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Completed tools */}
                  {streamingState.toolsExecuted && streamingState.toolsExecuted.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {streamingState.toolsExecuted.map((tool, index) => (
                        <Badge
                          key={tool}
                          variant="secondary"
                          className={cn(
                            "text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0 py-0.5 px-2",
                            "animate-in fade-in-0 zoom-in-95 duration-300"
                          )}
                          style={{ animationDelay: `${index * 100}ms` }}
                        >
                          <CheckCircle2 className="mr-0.5 size-2" />
                          {tool.replace(/_/g, ' ').replace(/^get /, '')}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Analytics data cards - animate in */}
            {hasAnalyticsData && (
              <div className="animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
                <AnalyticsDataRenderer dataBlocks={message.analyticsData!} />
              </div>
            )}

            {/* Text content - streams in naturally */}
            {hasContent && (
              <div className={cn(
                'prose prose-sm max-w-none dark:prose-invert animate-in fade-in-0 duration-300',
                'prose-p:my-1 prose-p:leading-relaxed',
                'prose-ul:my-2 prose-ol:my-2',
                'prose-li:my-0.5',
                'prose-headings:my-2 prose-headings:font-semibold',
                'prose-h1:text-base prose-h2:text-sm prose-h3:text-sm',
                'prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:text-xs prose-code:before:content-none prose-code:after:content-none',
                'prose-pre:my-2 prose-pre:rounded-lg prose-pre:bg-muted prose-pre:p-3 prose-pre:text-xs',
                'prose-table:my-3 prose-table:w-full prose-table:border-collapse prose-table:rounded-lg prose-table:overflow-hidden prose-table:text-sm',
                'prose-thead:bg-muted/50',
                'prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-semibold prose-th:border-b prose-th:border-border',
                'prose-td:px-3 prose-td:py-2 prose-td:border-b prose-td:border-border/50',
                'prose-tr:hover:bg-muted/30',
                'prose-strong:font-semibold',
                message.error && 'text-red-700 dark:text-red-300',
                hasAnalyticsData && 'mt-4 pt-4 border-t border-border/30'
              )}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {message.content}
                </ReactMarkdown>
                {message.isStreaming && (
                  <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-violet-500 rounded-full" />
                )}
              </div>
            )}
          </div>
        )}

        {/* Figures the answer gives that its data doesn't contain */}
        {!message.isStreaming && message.unverifiedFigures && message.unverifiedFigures.length > 0 && (
          <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              Couldn&apos;t find {message.unverifiedFigures.length === 1 ? 'this figure' : 'these figures'} in the data
              this answer used: {message.unverifiedFigures.join(', ')}. Check them before relying on them.
            </span>
          </p>
        )}

        {/* Tools used badges */}
        {!message.isStreaming && message.toolsUsed && message.toolsUsed.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/50 pt-2.5 animate-in fade-in-0 duration-300">
            {message.toolsUsed.map((tool) => (
              <Badge key={tool} variant="secondary" className="text-xs font-normal py-0.5 px-2">
                {tool.replace(/_/g, ' ').replace(/^get /, '')}
              </Badge>
            ))}
          </div>
        )}

        {/* Follow-up suggestion chips */}
        {!message.isStreaming && message.suggestedFollowUps && message.suggestedFollowUps.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-border/50 pt-3 animate-in fade-in-0 slide-in-from-bottom-1 duration-500">
            <span className="mr-0.5 text-xs text-muted-foreground self-center">Follow up:</span>
            {message.suggestedFollowUps.map((followUp, i) => (
              <button
                key={i}
                onClick={() => onFollowUpClick?.(followUp)}
                className="text-xs px-3 py-1.5 rounded-full bg-violet-100 hover:bg-violet-200 dark:bg-violet-900/50 dark:hover:bg-violet-800/50 text-violet-700 dark:text-violet-300 transition-colors cursor-pointer"
              >
                {followUp}
              </button>
            ))}
          </div>
        )}

        {/* Timestamp */}
        {!message.isStreaming && (
          <p className="mt-2 text-xs text-muted-foreground">
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>
    </div>
  );
}

// Contextual loading phrases that rotate based on what's happening
const LOADING_PHRASES = {
  idle: [
    'Preparing your insights',
    'Getting ready to analyze',
    'Initializing analytics engine',
  ],
  connecting: [
    'Establishing connection',
    'Connecting to data sources',
    'Preparing query pipeline',
  ],
  thinking: [
    'Understanding your question',
    'Analyzing context',
    'Determining best approach',
    'Processing your request',
  ],
  fetching: [
    'Querying analytics data',
    'Gathering metrics',
    'Fetching insights',
    'Collecting data points',
  ],
  analyzing: [
    'Analyzing patterns',
    'Processing results',
    'Identifying trends',
    'Crunching numbers',
  ],
  generating: [
    'Crafting response',
    'Preparing insights',
    'Generating analysis',
    'Composing summary',
  ],
};

// Tool-specific phrases
const TOOL_PHRASES: Record<string, string[]> = {
  get_search_overview: ['Fetching search metrics', 'Gathering search statistics', 'Analyzing search activity'],
  get_search_trends: ['Charting search trends', 'Analyzing volume patterns', 'Tracking search history'],
  get_popular_queries: ['Finding top queries', 'Ranking popular searches', 'Analyzing query frequency'],
  get_zero_result_queries: ['Identifying content gaps', 'Finding failed searches', 'Analyzing zero-result patterns'],
  get_search_type_breakdown: ['Breaking down search types', 'Categorizing searches', 'Analyzing search methods'],
  get_search_performance: ['Measuring latency', 'Analyzing response times', 'Checking performance metrics'],
  get_ai_usage: ['Calculating AI costs', 'Measuring token usage', 'Analyzing AI activity'],
  get_tool_usage: ['Tracking tool executions', 'Measuring tool performance', 'Analyzing tool patterns'],
  get_recent_searches: ['Loading recent activity', 'Fetching latest searches', 'Getting live data'],
  get_query_search_events: ['Investigating search events', 'Analyzing query patterns', 'Digging into details'],
  respond_with_analytics: ['Formatting response', 'Preparing insights', 'Composing analysis'],
};

function useRotatingPhrase(phrases: string[], intervalMs: number = 2500) {
  const [index, setIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsVisible(false);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % phrases.length);
        setIsVisible(true);
      }, 200);
    }, intervalMs);

    return () => clearInterval(interval);
  }, [phrases, intervalMs]);

  return { phrase: phrases[index], isVisible };
}

function getPhaseFromStatus(status?: string, activeTool?: string): keyof typeof LOADING_PHRASES {
  if (!status) return 'idle';
  const lower = status.toLowerCase();
  if (lower.includes('connect')) return 'connecting';
  if (lower.includes('think') || lower.includes('understand')) return 'thinking';
  if (lower.includes('fetch') || lower.includes('query') || lower.includes('gathering') || activeTool) return 'fetching';
  if (lower.includes('analyz') || lower.includes('process')) return 'analyzing';
  if (lower.includes('generat') || lower.includes('craft') || lower.includes('prepar')) return 'generating';
  return 'thinking';
}
