// app/playground/unified-search/_components/SummaryPanel.tsx

'use client';

/**
 * Summary Panel
 *
 * Test AI-powered summary generation from search results.
 * First search, then generate a summary from the results.
 */

import { useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Search,
  Loader2,
  Brain,
  Sparkles,
  Clock,
  Hash,
  ArrowRight,
  CheckCircle,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Markdown } from '@/shared/ui/custom/markdown';

// ============================================================================
// TYPES
// ============================================================================

interface SummaryPanelProps {
  experienceId: string;
  slug: string;
  accessToken?: string;
}

interface SearchResult {
  id: string;
  index: { id: string; name: string };
  score: number;
  fields: Record<string, unknown>;
}

interface SearchResponse {
  query: string;
  results: SearchResult[];
  pagination: { totalResults: number };
  timing: { totalMs: number };
}

// ============================================================================
// COMPONENT
// ============================================================================

export function SummaryPanel({ experienceId, slug, accessToken }: SummaryPanelProps) {
  // State
  const [query, setQuery] = useState('');
  const [instruction, setInstruction] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null);
  const [summary, setSummary] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Search mutation
  const searchMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/v1/search/${slug}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
        },
        body: JSON.stringify({
          query,
          pageSize: 10,
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || json.message || 'Search failed');
      }
      return json.data as SearchResponse;
    },
    onSuccess: (data) => {
      setSearchResults(data);
      setSummary('');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Generate summary with streaming
  const handleGenerateSummary = useCallback(async () => {
    if (!searchResults || searchResults.results.length === 0) {
      toast.error('No search results to summarize');
      return;
    }

    // Prepare request
    const requestBody = {
      query: searchResults.query,
      results: searchResults.results.map((r) => ({
        id: r.id,
        index: r.index,
        fields: r.fields,
      })),
      totalResults: searchResults.pagination.totalResults,
      instruction: instruction || undefined,
    };

    // Reset state
    setSummary('');
    setIsStreaming(true);

    // Create abort controller
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`/api/v1/search/${slug}/summarize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
        },
        body: JSON.stringify(requestBody),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate summary');
      }

      // Handle SSE stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'content') {
                setSummary((prev) => prev + parsed.content);
              } else if (parsed.type === 'error') {
                throw new Error(parsed.error);
              }
            } catch {
              // Ignore parse errors for partial JSON
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        toast.info('Summary generation stopped');
      } else {
        toast.error((error as Error).message);
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [searchResults, instruction, slug, accessToken]);

  // Stop streaming
  const handleStopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  // Handle search
  const handleSearch = useCallback(() => {
    if (!query.trim()) {
      toast.error('Please enter a search query');
      return;
    }
    searchMutation.mutate();
  }, [query, searchMutation]);

  return (
    <div className="h-full flex">
      {/* Left Panel - Controls */}
      <div className="w-96 shrink-0 border-r bg-muted/30 p-4 overflow-y-auto">
        <div className="space-y-6">
          {/* Step 1: Search */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-full bg-blue-500/10 text-blue-600">
                <span className="text-xs font-bold">1</span>
              </div>
              <h3 className="text-sm font-medium">Search for content</h3>
            </div>

            <div className="space-y-3 pl-6">
              <div className="space-y-2">
                <Label className="text-xs">Search Query</Label>
                <div className="flex gap-2">
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Enter search query..."
                    className="flex-1"
                  />
                  <Button
                    size="icon"
                    onClick={handleSearch}
                    disabled={searchMutation.isPending || !query.trim()}
                  >
                    {searchMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Search Results Summary */}
              {searchResults && (
                <div className="p-3 rounded-lg bg-background border space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium">Results found</span>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="secondary" className="text-xs">
                      <Hash className="h-3 w-3 mr-1" />
                      {searchResults.pagination.totalResults} results
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      <Clock className="h-3 w-3 mr-1" />
                      {searchResults.timing.totalMs}ms
                    </Badge>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Step 2: Generate Summary */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'p-1.5 rounded-full',
                  searchResults ? 'bg-purple-500/10 text-purple-600' : 'bg-muted text-muted-foreground'
                )}
              >
                <span className="text-xs font-bold">2</span>
              </div>
              <h3 className={cn('text-sm font-medium', !searchResults && 'text-muted-foreground')}>
                Generate AI Summary
              </h3>
            </div>

            <div className={cn('space-y-3 pl-6', !searchResults && 'opacity-50')}>
              <div className="space-y-2">
                <Label className="text-xs">Custom Instruction (optional)</Label>
                <Textarea
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="e.g., Focus on pricing information..."
                  rows={2}
                  disabled={!searchResults}
                  className="resize-none"
                />
              </div>

              <Button
                onClick={handleGenerateSummary}
                disabled={!searchResults || isStreaming || searchResults.results.length === 0}
                className="w-full"
              >
                {isStreaming ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Brain className="h-4 w-4 mr-2" />
                    Generate Summary
                  </>
                )}
              </Button>

              {isStreaming && (
                <Button variant="outline" onClick={handleStopStreaming} className="w-full">
                  Stop Generation
                </Button>
              )}
            </div>
          </div>

          {/* API Info */}
          <div className="pt-4 border-t">
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium">API Endpoint:</p>
              <code className="block bg-muted p-2 rounded text-[10px] break-all">
                POST /api/v1/search/{slug}/summarize
              </code>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Summary Output */}
      <div className="flex-1 flex flex-col min-h-0">
        <ScrollArea className="flex-1">
          <div className="p-6">
            {/* Empty State */}
            {!summary && !isStreaming && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="p-4 rounded-2xl bg-gradient-to-br from-violet-500/10 to-purple-500/10 mb-4">
                  <Sparkles className="h-8 w-8 text-violet-600" />
                </div>
                <h3 className="text-lg font-medium mb-2">AI Summary</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Search for content first, then generate an AI-powered summary of the results.
                </p>
              </div>
            )}

            {/* Summary Output */}
            {(summary || isStreaming) && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Brain className="h-4 w-4 text-purple-600" />
                    Generated Summary
                    {isStreaming && (
                      <Badge variant="secondary" className="ml-auto text-xs">
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Streaming
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    {summary ? (
                      <>
                        <Markdown>{summary}</Markdown>
                        {isStreaming && (
                          <span className="inline-block w-2 h-4 bg-current ml-1 animate-pulse rounded-sm" />
                        )}
                      </>
                    ) : (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generating summary...
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Search Results Preview */}
            {searchResults && searchResults.results.length > 0 && (
              <div className="mt-6">
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Source Results ({searchResults.results.length})
                </h4>
                <div className="grid gap-2">
                  {searchResults.results.slice(0, 5).map((result, idx) => (
                    <div
                      key={result.id}
                      className="p-3 rounded-lg border bg-muted/30 text-sm"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs font-mono">
                          #{idx + 1}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {result.index.name}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground line-clamp-2">
                        {(result.fields.title as string) ||
                          (result.fields.name as string) ||
                          (result.fields.content as string)?.slice(0, 100) ||
                          'No preview available'}
                      </p>
                    </div>
                  ))}
                  {searchResults.results.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      +{searchResults.results.length - 5} more results
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
