// app/playground/unified-search/_components/SearchPanel.tsx

'use client';

/**
 * Search Panel
 *
 * Layout: compact options inline in the header, results always full-width,
 * Filters/Sort/Facets in a toggleable sidebar that is hidden by default.
 */

import { useState, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Search,
  Loader2,
  FileText,
  ChevronRight,
  ChevronDown,
  Clock,
  Hash,
  Sparkles,
  AlertCircle,
  Filter,
  BarChart3,
  ArrowUpDown,
  SlidersHorizontal,
  X,
  Copy,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AutocompleteInput } from '../../search/_components/AutocompleteInput';
import { FilterBuilder } from '../../search/_components/FilterBuilder';
import { FacetBuilder } from '../../search/_components/FacetBuilder';
import { SortBuilder } from '../../search/_components/SortBuilder';
import type {
  FilterClause,
  FacetRequest,
  SortClause,
} from '../../search/_lib/hooks/useSearchPlayground';

// ============================================================================
// TYPES
// ============================================================================

interface SearchPanelProps {
  experienceId: string;
  slug: string;
  accessToken?: string;
}

interface SearchResult {
  id: string;
  index: { id: string; name: string };
  score: number;
  fields: Record<string, unknown>;
  highlights?: Record<string, string[]>;
}

interface SearchResponse {
  query: string;
  results: SearchResult[];
  facets?: Record<string, { buckets: Array<{ key: string; doc_count: number }> }>;
  pagination: { page: number; pageSize: number; totalResults: number; totalPages: number };
  timing: { totalMs: number; searchMs?: number };
}

// ============================================================================
// SIDEBAR SECTION — flat collapsible within the filter panel
// ============================================================================

function PanelSection({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  const hasItems = (count ?? 0) > 0;
  return (
    <Collapsible defaultOpen={hasItems}>
      <CollapsibleTrigger className="group flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors">
        <span className="flex items-center gap-2">
          {icon}
          {title}
          {hasItems && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
              {count}
            </Badge>
          )}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-4 pb-4 pt-1">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ============================================================================
// COMPONENT
// ============================================================================

export function SearchPanel({ experienceId, slug, accessToken }: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState<string>('auto');
  const [pageSize, setPageSize] = useState(10);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [autocompleteEnabled, setAutocompleteEnabled] = useState(true);
  const [enableHighlight, setEnableHighlight] = useState(true);
  const [enableDebug, setEnableDebug] = useState(false);
  const [filters, setFilters] = useState<FilterClause[]>([]);
  const [sorts, setSorts] = useState<SortClause[]>([]);
  const [facets, setFacets] = useState<FacetRequest[]>([]);

  // Sidebar visibility (default closed so results get full width)
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const pageRef = useRef(1);
  const [displayPage, setDisplayPage] = useState(1);

  const setPage = useCallback((p: number) => {
    pageRef.current = p;
    setDisplayPage(p);
  }, []);

  const buildRequest = useCallback(
    (overridePage?: number) => {
      const p = overridePage ?? pageRef.current;
      return {
        query,
        page: p,
        pageSize,
        ...(searchType !== 'auto' ? { searchType } : {}),
        ...(filters.length > 0 ? { filters } : {}),
        ...(sorts.length > 0 ? { sort: sorts } : {}),
        ...(facets.length > 0 ? { facets } : {}),
        ...(enableHighlight
          ? { highlight: { preTag: '<mark>', postTag: '</mark>', fragmentSize: 200, numberOfFragments: 3 } }
          : {}),
        ...(enableDebug ? { explain: true } : {}),
      } as Record<string, unknown>;
    },
    [query, searchType, pageSize, filters, sorts, facets, enableHighlight, enableDebug]
  );

  const searchMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const response = await fetch(`/api/v1/search/${slug}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
        },
        body: JSON.stringify(body),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || json.message || 'Search failed');
      return json.data as SearchResponse;
    },
    onSuccess: (data) => setResults(data),
    onError: (error: Error) => toast.error(error.message),
  });

  const handleSearch = useCallback(
    (searchQuery?: string) => {
      const q = searchQuery ?? query;
      if (!q.trim()) { toast.error('Please enter a search query'); return; }
      if (searchQuery) setQuery(searchQuery);
      setPage(1);
      searchMutation.mutate(buildRequest(1));
    },
    [query, buildRequest, searchMutation, setPage]
  );

  const handlePageChange = useCallback(
    (newPage: number) => {
      setPage(newPage);
      searchMutation.mutate(buildRequest(newPage));
    },
    [buildRequest, searchMutation, setPage]
  );

  const toggleResultExpanded = (id: string) => {
    setExpandedResults((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const activeConfigCount = filters.length + sorts.length + facets.length;

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <div className="shrink-0 border-b bg-background">

        {/* Search row */}
        <div className="flex items-center gap-2 px-4 pt-3 pb-2">
          {/* Filter panel toggle */}
          <Button
            variant={sidebarOpen ? 'secondary' : 'outline'}
            size="sm"
            className="h-10 gap-1.5 shrink-0 font-normal"
            onClick={() => setSidebarOpen((v) => !v)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {activeConfigCount > 0 ? (
              <Badge className="h-4 px-1.5 text-[10px] ml-0.5">{activeConfigCount}</Badge>
            ) : (
              <span className="text-xs hidden sm:inline">Filters</span>
            )}
          </Button>

          {/* Search input */}
          <div className="flex-1 min-w-0">
            <AutocompleteInput
              apiUrl="/api/v1/autocomplete"
              accessToken={accessToken || ''}
              enabled={autocompleteEnabled && !!accessToken}
              minLength={2}
              maxSuggestions={10}
              debounceMs={150}
              placeholder="Start typing to search…"
              initialQuery={query}
              onQueryChange={setQuery}
              onSearch={handleSearch}
              onSuggestionSelect={(s) => setQuery(s.text)}
              showTiming={true}
              inputClassName="h-10"
            />
          </div>

          {/* Type */}
          <Select value={searchType} onValueChange={setSearchType}>
            <SelectTrigger className="h-10 w-[110px] shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto</SelectItem>
              <SelectItem value="lexical">Lexical</SelectItem>
              <SelectItem value="semantic">Semantic</SelectItem>
              <SelectItem value="hybrid">Hybrid</SelectItem>
            </SelectContent>
          </Select>

          {/* Search button */}
          <Button
            onClick={() => handleSearch()}
            disabled={searchMutation.isPending || !query.trim()}
            className="h-10 px-4 shrink-0"
          >
            {searchMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Options strip + API hint */}
        <div className="flex items-center gap-x-4 gap-y-1 px-4 pb-2.5 flex-wrap">
          <span className="font-mono text-[11px] text-muted-foreground">
            POST /api/v1/search/{slug}/search
          </span>

          <Separator orientation="vertical" className="h-3.5 hidden sm:block" />

          {/* Highlight */}
          <div className="flex items-center gap-1.5">
            <Switch
              id="hl"
              checked={enableHighlight}
              onCheckedChange={setEnableHighlight}
              className="scale-75 origin-left"
            />
            <Label htmlFor="hl" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
              Highlight
            </Label>
          </div>

          {/* Debug */}
          <div className="flex items-center gap-1.5">
            <Switch
              id="dbg"
              checked={enableDebug}
              onCheckedChange={setEnableDebug}
              className="scale-75 origin-left"
            />
            <Label htmlFor="dbg" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
              Debug
            </Label>
          </div>

          {/* Autocomplete */}
          <div className="flex items-center gap-1.5">
            <Switch
              id="ac"
              checked={autocompleteEnabled}
              onCheckedChange={setAutocompleteEnabled}
              className="scale-75 origin-left"
            />
            <Label htmlFor="ac" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
              Autocomplete
            </Label>
          </div>

          {/* Page size */}
          <div className="flex items-center gap-1.5">
            <Label htmlFor="ps" className="text-xs text-muted-foreground whitespace-nowrap">
              Per page
            </Label>
            <Select value={pageSize.toString()} onValueChange={(v) => setPageSize(parseInt(v))}>
              <SelectTrigger id="ps" className="h-6 w-14 text-xs px-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5</SelectItem>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 min-h-0 flex overflow-hidden">

        {/* Filter / Sort / Facets panel — only rendered when open */}
        {sidebarOpen && (
          <div className="w-72 shrink-0 border-r flex flex-col overflow-hidden bg-muted/10">
            <div className="flex items-center justify-between px-4 py-2.5 border-b">
              <span className="text-sm font-semibold">Refine</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="py-1">
                <PanelSection
                  icon={<Filter className="h-3.5 w-3.5" />}
                  title="Filters"
                  count={filters.length}
                >
                  <FilterBuilder
                    filters={filters}
                    onFiltersChange={setFilters}
                    context={null}
                    isLoading={false}
                    allowFreeform
                  />
                </PanelSection>

                <Separator className="mx-4" />

                <PanelSection
                  icon={<ArrowUpDown className="h-3.5 w-3.5" />}
                  title="Sort"
                  count={sorts.length}
                >
                  <SortBuilder sorts={sorts} onSortsChange={setSorts} />
                </PanelSection>

                <Separator className="mx-4" />

                <PanelSection
                  icon={<BarChart3 className="h-3.5 w-3.5" />}
                  title="Facets"
                  count={facets.length}
                >
                  <FacetBuilder
                    facets={facets}
                    onFacetsChange={setFacets}
                    context={null}
                    isLoading={false}
                    allowFreeform
                  />
                </PanelSection>
              </div>
            </ScrollArea>

            {activeConfigCount > 0 && (
              <div className="shrink-0 border-t px-4 py-2 bg-muted/30">
                <p className="text-[11px] text-muted-foreground">
                  {[
                    filters.length > 0 && `${filters.length} filter${filters.length !== 1 ? 's' : ''}`,
                    sorts.length > 0 && `${sorts.length} sort${sorts.length !== 1 ? 's' : ''}`,
                    facets.length > 0 && `${facets.length} facet${facets.length !== 1 ? 's' : ''}`,
                  ].filter(Boolean).join(' · ')} active
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Results area ── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

          {/* Results header */}
          {results && (
            <div className="shrink-0 border-b px-4 py-2 flex items-center justify-between gap-2 bg-muted/10">
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <Badge variant="secondary" className="gap-1 shrink-0">
                  <Hash className="h-3 w-3" />
                  {results.pagination.totalResults.toLocaleString()} results
                </Badge>
                <Badge variant="outline" className="gap-1 shrink-0">
                  <Clock className="h-3 w-3" />
                  {results.timing.totalMs}ms
                </Badge>
                {activeConfigCount > 0 && (
                  <Badge variant="outline" className="gap-1 text-amber-600 border-amber-200 shrink-0">
                    <Filter className="h-3 w-3" />
                    {activeConfigCount} active
                  </Badge>
                )}
              </div>

              {results.pagination.totalPages > 1 && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2.5 text-xs"
                    disabled={displayPage === 1 || searchMutation.isPending}
                    onClick={() => handlePageChange(displayPage - 1)}
                  >
                    ← Prev
                  </Button>
                  <span className="text-xs text-muted-foreground px-1 whitespace-nowrap">
                    {displayPage} / {results.pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2.5 text-xs"
                    disabled={displayPage === results.pagination.totalPages || searchMutation.isPending}
                    onClick={() => handlePageChange(displayPage + 1)}
                  >
                    Next →
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Scrollable results — plain overflow-y-auto avoids Radix ScrollArea's
              display:table content slot which forces children to max-content width */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="p-4 space-y-2">

              {/* Empty state */}
              {!results && !searchMutation.isPending && (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <div className="p-5 rounded-2xl bg-linear-to-br from-blue-500/10 to-cyan-500/10 mb-5">
                    <Search className="h-9 w-9 text-blue-500" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Ready to search</h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Enter a query above and press Enter. Use the{' '}
                    <button
                      onClick={() => setSidebarOpen(true)}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      Filters panel
                    </button>{' '}
                    to add filters, sorting, and facets.
                  </p>
                </div>
              )}

              {/* Loading */}
              {searchMutation.isPending && (
                <>
                  {[...Array(3)].map((_, i) => (
                    <Card key={i}>
                      <CardContent className="p-4 space-y-2">
                        <Skeleton className="h-4 w-1/2" />
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-3/4" />
                      </CardContent>
                    </Card>
                  ))}
                </>
              )}

              {/* Results */}
              {results && !searchMutation.isPending && (
                <>
                  {results.results.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                      <AlertCircle className="h-8 w-8 text-muted-foreground mb-3" />
                      <h3 className="font-semibold mb-1">No results found</h3>
                      <p className="text-sm text-muted-foreground">
                        Try adjusting your query or removing filters.
                      </p>
                    </div>
                  ) : (
                    <>
                      {results.results.map((result, idx) => (
                        <SearchResultCard
                          key={result.id}
                          result={result}
                          rank={idx + 1 + (displayPage - 1) * pageSize}
                          expanded={expandedResults.has(result.id)}
                          onToggle={() => toggleResultExpanded(result.id)}
                        />
                      ))}

                      {/* Facet results */}
                      {results.facets && Object.keys(results.facets).length > 0 && (
                        <div className="pt-4 border-t mt-4">
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                            <BarChart3 className="h-3.5 w-3.5" />
                            Facet Results
                          </h4>
                          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                            {Object.entries(results.facets).map(([field, facetData]) => (
                              <Card key={field} className="overflow-hidden">
                                <div className="px-3 py-2 bg-muted/30 border-b">
                                  <p className="text-xs font-medium truncate">{field}</p>
                                </div>
                                <CardContent className="p-3 space-y-1">
                                  {facetData.buckets.slice(0, 8).map((b) => (
                                    <div key={b.key} className="flex items-center justify-between gap-2 text-xs">
                                      <span className="truncate text-muted-foreground">{b.key}</span>
                                      <Badge variant="secondary" className="text-[10px] shrink-0">{b.doc_count}</Badge>
                                    </div>
                                  ))}
                                  {facetData.buckets.length > 8 && (
                                    <p className="text-[10px] text-muted-foreground pt-1">
                                      +{facetData.buckets.length - 8} more
                                    </p>
                                  )}
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// COPY BUTTON
// ============================================================================

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="flex items-center gap-1 px-2 py-1 text-[10px] rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
    >
      {copied ? (
        <><Check className="h-3 w-3 text-green-500" />Copied</>
      ) : (
        <><Copy className="h-3 w-3" />Copy</>
      )}
    </button>
  );
}

// ============================================================================
// SEARCH RESULT CARD
// ============================================================================

interface SearchResultCardProps {
  result: SearchResult;
  rank: number;
  expanded: boolean;
  onToggle: () => void;
}

function SearchResultCard({ result, rank, expanded, onToggle }: SearchResultCardProps) {
  const title =
    (result.fields.title as string) ||
    (result.fields.name as string) ||
    (result.fields.heading as string) ||
    `Document ${result.id}`;

  const description =
    (result.fields.description as string) ||
    (result.fields.content as string) ||
    (result.fields.body as string) ||
    '';

  const highlights = result.highlights || {};
  const hasHighlights = Object.keys(highlights).length > 0;
  const json = JSON.stringify(result.fields, null, 2);

  return (
    // No Collapsible — plain conditional render avoids Radix's overflow:visible on open
    <div className="rounded-lg border bg-card text-card-foreground overflow-hidden">

      {/* ── Header (always visible, acts as toggle) ── */}
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3.5 flex items-start gap-3 hover:bg-muted/40 transition-colors"
      >
        {/* Rank badge */}
        <span className="shrink-0 mt-px text-[11px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
          #{rank}
        </span>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge variant="secondary" className="text-xs shrink-0 font-normal">
              {result.index.name}
            </Badge>
            <span className="text-xs text-muted-foreground tabular-nums">
              {result.score.toFixed(4)}
            </span>
            {hasHighlights && !expanded && (
              <span className="text-xs text-amber-600 flex items-center gap-0.5">
                <Sparkles className="h-3 w-3 shrink-0" />
                {Object.keys(highlights).length}
              </span>
            )}
          </div>
          <p className="text-sm font-semibold leading-snug truncate">{title}</p>
          {!expanded && description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5 leading-snug">
              {description.length > 220 ? description.slice(0, 220) + '…' : description}
            </p>
          )}
        </div>

        {/* Chevron */}
        <ChevronRight
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform duration-150 shrink-0 mt-0.5',
            expanded && 'rotate-90'
          )}
        />
      </button>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div className="border-t divide-y">

          {/* Highlights */}
          {hasHighlights && (
            <div className="px-4 py-3.5 space-y-3 bg-amber-50/40 dark:bg-amber-950/10">
              <h5 className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" />
                Highlights
              </h5>
              <div className="space-y-2.5">
                {Object.entries(highlights).map(([field, snippets]) => (
                  <div key={field}>
                    <p className="text-[11px] font-medium text-muted-foreground mb-1">{field}</p>
                    {/* overflow-wrap + word-break ensure long tokens wrap instead of clipping */}
                    <div
                      className="text-sm bg-background px-3 py-2 rounded-md border leading-relaxed wrap-break-word [&_mark]:bg-yellow-200 [&_mark]:dark:bg-yellow-900/60 [&_mark]:text-yellow-900 [&_mark]:dark:text-yellow-200 [&_mark]:px-0.5 [&_mark]:rounded-sm"
                      dangerouslySetInnerHTML={{
                        __html: Array.isArray(snippets) ? snippets.join(' … ') : String(snippets),
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All Fields — JSON */}
          <div className="px-4 py-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <h5 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="h-3 w-3" />
                All Fields
              </h5>
              <CopyButton text={json} />
            </div>
            {/* overflow-x-auto wrapper owns the scroll region at a fixed width (= card width).
                The pre is w-max so it's exactly content-wide and scrolls inside the wrapper. */}
            <div className="rounded-md border bg-muted/30 overflow-x-auto">
              <pre className="text-xs px-3 py-3 leading-relaxed font-mono text-foreground w-max min-w-full">
                {json}
              </pre>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
