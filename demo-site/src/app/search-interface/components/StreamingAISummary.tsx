'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, ChevronUp, ChevronDown, Loader2, RefreshCw } from 'lucide-react';
import { useAISummary } from '@/hooks/use-ai-summary';
import type { SearchResult } from '@/lib/api/types';

// ============================================================================
// TYPES
// ============================================================================

interface StreamingAISummaryProps {
  query: string;
  results: SearchResult[];
  isSearchLoading: boolean;
  onFollowUpClick?: (query: string) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function StreamingAISummary({ query, results, isSearchLoading, onFollowUpClick }: StreamingAISummaryProps) {
  const {
    summary,
    followUpQueries,
    isStreaming,
    isComplete,
    isCollapsed,
    shouldShow,
    generate,
    reset,
    toggleCollapsed,
  } = useAISummary();

  const lastQueryRef = useRef<string>('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasEnoughResults = results.length >= 3;
  const hasMountedRef = useRef(false);

  // Generate summary when query changes (not on filter changes)
  useEffect(() => {
    // Only auto-generate when:
    // 1. We have a query
    // 2. We have enough results (3+)
    // 3. Search is not loading
    // 4. Query has changed since last generation
    if (query && hasEnoughResults && !isSearchLoading && query !== lastQueryRef.current) {
      lastQueryRef.current = query;

      // On first mount, generate immediately. On subsequent changes, debounce.
      if (!hasMountedRef.current) {
        hasMountedRef.current = true;
        generate(query, results);
      } else {
        const timer = setTimeout(() => {
          generate(query, results);
        }, 300);
        return () => clearTimeout(timer);
      }
    }

    // Only reset when there's no query AND we're not loading
    // Don't reset during loading because results will come
    if (!query && !isSearchLoading) {
      reset();
      lastQueryRef.current = '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, hasEnoughResults, isSearchLoading, results]);

  // Manual regenerate handler with animation
  const handleRegenerate = () => {
    if (query && hasEnoughResults && !isStreaming) {
      setIsRefreshing(true);
      generate(query, results);
      // Reset animation after 1 second
      setTimeout(() => setIsRefreshing(false), 1000);
    }
  };

  // Show prompt to generate if no summary but enough results
  const showGeneratePrompt = !shouldShow && !isStreaming && query && hasEnoughResults && !isSearchLoading;

  // Show the component if we have summary/streaming OR if we can generate
  if (!shouldShow && !isStreaming && !showGeneratePrompt) {
    return null;
  }

  return (
    <div className="mb-5">
      {/* Main card - clean design matching page */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-muted/50 via-card to-muted/30 border border-border shadow-sm">
        {/* Subtle decorative gradient */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-56 h-56 bg-gradient-to-tr from-primary/5 via-muted/30 to-transparent rounded-full blur-3xl translate-y-1/2 -translate-x-1/4 pointer-events-none" />

        {/* Content */}
        <div className="relative px-6 py-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              {/* Icon */}
              <div className="relative flex-shrink-0">
                <div className="w-11 h-11 rounded-xl bg-primary flex items-center justify-center shadow-lg">
                  <Sparkles className="w-5 h-5 text-primary-foreground" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground tracking-tight">AI Summary</h3>
                {isStreaming && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                    Analyzing results...
                  </p>
                )}
                {isComplete && !isStreaming && (
                  <p className="text-sm text-muted-foreground">Powered by AI • Based on your results</p>
                )}
                {showGeneratePrompt && (
                  <p className="text-sm text-muted-foreground">Get AI-powered insights instantly</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Regenerate/Generate button - icon only with animation */}
              {/* Show when complete, when can generate, OR when streaming (animated) */}
              {((isComplete || showGeneratePrompt) || isStreaming) && (
                <button
                  onClick={handleRegenerate}
                  disabled={isStreaming}
                  className={`w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-md transition-all duration-200 cursor-pointer ${
                    isStreaming ? 'opacity-80' : 'hover:shadow-lg hover:scale-105 active:scale-95'
                  }`}
                  title={isStreaming ? 'Generating...' : (showGeneratePrompt ? 'Generate summary' : 'Refresh summary')}
                >
                  <RefreshCw className={`w-5 h-5 text-primary-foreground transition-transform duration-700 ${isStreaming || isRefreshing ? 'animate-spin' : ''}`} />
                </button>
              )}

              {isComplete && !showGeneratePrompt && (
                <button
                  onClick={toggleCollapsed}
                  className="h-10 w-10 p-0 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center cursor-pointer"
                >
                  {isCollapsed ? (
                    <ChevronDown className="h-5 w-5" />
                  ) : (
                    <ChevronUp className="h-5 w-5" />
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Summary Content */}
          {!isCollapsed && !showGeneratePrompt && (
            <div className="pl-[60px]">
              {isStreaming && !summary ? (
                <div className="space-y-3">
                  <div className="h-4 bg-muted rounded-full w-full animate-pulse" />
                  <div className="h-4 bg-muted rounded-full w-5/6 animate-pulse" />
                  <div className="h-4 bg-muted rounded-full w-4/6 animate-pulse" />
                </div>
              ) : (
                <div className="text-[15px] text-foreground/80 leading-relaxed">
                  {summary}
                  {isStreaming && (
                    <span className="inline-block w-0.5 h-5 bg-foreground ml-1 animate-pulse align-middle" />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Follow-up query chips */}
          {isComplete && followUpQueries.length > 0 && !isCollapsed && onFollowUpClick && (
            <div className="pl-[60px] mt-3 flex flex-wrap gap-2">
              <span className="text-xs font-medium text-muted-foreground mr-1 self-center">Try:</span>
              {followUpQueries.map((q) => (
                <button
                  type="button"
                  key={q}
                  onClick={() => onFollowUpClick(q)}
                  className="inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors cursor-pointer"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Generate prompt message */}
          {showGeneratePrompt && (
            <div className="pl-[60px]">
              <p className="text-[15px] text-muted-foreground">
                Click &quot;Generate&quot; to get an AI-powered summary of your current search results.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
