'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Search,
  ArrowRight,
  ArrowUp,
  Settings,
  Sparkles,
  X,
  LayoutGrid,
  LayoutList,
  Loader2,
  Check,
  ChevronLeft,
  ChevronRight,
  PanelRightOpen,
  PanelRightClose,
  RotateCcw,
  Zap,
  MessageSquare,
} from 'lucide-react';

import { useSettings } from '@/contexts/settings-context';
import { useSearch } from '@/hooks/use-search';
import { useAutocomplete } from '@/hooks/use-autocomplete';
import { useAISummary } from '@/hooks/use-ai-summary';
import { DynamicResultCard } from '../../search-interface/components/DynamicResultCard';
import { SettingsModal } from '../../search-interface/components/SettingsModal';

// ============================================================================
// STREAMING TEXT
// ============================================================================

function StreamText({ text, speed = 14, onDone }: { text: string; speed?: number; onDone?: () => void }) {
  const [out, setOut] = useState('');
  const idx = useRef(0);

  useEffect(() => {
    idx.current = 0;
    setOut('');
    const iv = setInterval(() => {
      idx.current++;
      setOut(text.slice(0, idx.current));
      if (idx.current >= text.length) {
        clearInterval(iv);
        onDone?.();
      }
    }, speed);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, speed]);

  return (
    <span>
      {out}
      {out.length < text.length && (
        <span className="inline-block w-0.5 h-4 bg-primary ml-0.5 animate-pulse align-text-bottom" />
      )}
    </span>
  );
}

// ============================================================================
// GUIDE BUBBLE
// ============================================================================

function GuideBubble({
  children,
  isNew = false,
}: {
  children: React.ReactNode;
  isNew?: boolean;
}) {
  return (
    <div
      className={`bg-card rounded-2xl p-4 border border-border shadow-sm mb-3 ${
        isNew ? 'animate-fade-in-up' : ''
      }`}
    >
      {children}
    </div>
  );
}

// ============================================================================
// JOURNEY BREADCRUMBS
// ============================================================================

function JourneyBreadcrumbs({
  query,
  selectedFacets,
  resultCount,
}: {
  query: string;
  selectedFacets: Record<string, string[]>;
  resultCount: number;
}) {
  const steps = useMemo(() => {
    const s: { label: string; type: 'query' | 'filter' | 'count' }[] = [];
    if (query) s.push({ label: query, type: 'query' });
    for (const [field, values] of Object.entries(selectedFacets)) {
      const name = field.split('.').pop() || field;
      const pretty = name.replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').trim();
      s.push({ label: `${pretty}: ${values.join(', ')}`, type: 'filter' });
    }
    if (resultCount > 0) s.push({ label: `${resultCount} results`, type: 'count' });
    return s;
  }, [query, selectedFacets, resultCount]);

  if (steps.length <= 1) return null;

  return (
    <div className="mt-3 p-3 bg-card rounded-xl border border-border">
      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
        Journey
      </div>
      <div className="flex items-center gap-1.5 flex-wrap text-xs">
        {steps.map((step, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-primary/40">&rarr;</span>}
            <span
              className={`px-2 py-0.5 rounded-md font-semibold ${
                step.type === 'count'
                  ? 'text-foreground'
                  : 'bg-primary/10 text-primary'
              }`}
            >
              {step.label}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// AI GUIDE SIDEBAR
// ============================================================================

function AIGuideSidebar({
  query,
  facets,
  selectedFacets,
  resultCount,
  isLoading,
  onToggleFacet,
  onClearFacets,
  isCollapsed,
  onToggleCollapse,
}: {
  query: string;
  facets: { field: string; type: string; buckets: { key: string | number; count: number }[] }[];
  selectedFacets: Record<string, string[]>;
  resultCount: number;
  isLoading: boolean;
  onToggleFacet: (field: string, value: string) => void;
  onClearFacets: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const guideRef = useRef<HTMLDivElement>(null);
  const totalSelected = Object.values(selectedFacets).reduce((sum, v) => sum + v.length, 0);

  const formatFieldName = (field: string): string => {
    const name = field.split('.').pop() || field;
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  };

  // Collapsed state — floating button
  if (isCollapsed) {
    return (
      <button
        onClick={onToggleCollapse}
        className="fixed left-4 top-1/2 -translate-y-1/2 z-50 w-11 h-11 rounded-xl bg-primary text-primary-foreground shadow-lg flex items-center justify-center cursor-pointer hover:scale-105 transition-transform"
        title="Open AI Guide"
      >
        <Sparkles className="w-5 h-5" />
      </button>
    );
  }

  return (
    <aside
      ref={guideRef}
      className="w-80 flex-shrink-0 self-start sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto space-y-0 scrollbar-thin"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-md">
            <Sparkles className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="text-sm font-bold text-foreground">AI Guide</span>
          <span className="text-[9px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
            AI
          </span>
        </div>
        <button
          onClick={onToggleCollapse}
          className="text-muted-foreground hover:text-foreground cursor-pointer p-1"
          title="Minimize guide"
        >
          <PanelRightClose className="w-4 h-4" />
        </button>
      </div>

      {/* Greeting bubble */}
      {query && (
        <GuideBubble>
          <p className="text-sm text-muted-foreground leading-relaxed">
            <StreamText
              text={
                isLoading
                  ? `Searching for "${query}"...`
                  : resultCount > 0
                  ? `Found ${resultCount} results for "${query}." Use the filters below to narrow down.`
                  : `No results found for "${query}." Try a different search.`
              }
            />
          </p>
        </GuideBubble>
      )}

      {/* Facet refinement bubbles */}
      {facets.slice(0, 4).map((facet) => {
        const selected = selectedFacets[facet.field] || [];
        return (
          <GuideBubble key={facet.field} isNew>
            <div className="text-xs font-bold text-foreground uppercase tracking-wider mb-2.5">
              {formatFieldName(facet.field)}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {facet.buckets.slice(0, 8).map((bucket) => {
                const val = String(bucket.key);
                const isSelected = selected.includes(val);
                return (
                  <button
                    key={val}
                    onClick={() => onToggleFacet(facet.field, val)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-muted text-foreground hover:bg-primary/10 hover:text-primary border border-transparent hover:border-primary/20'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3" />}
                    {val}
                    <span
                      className={`text-[10px] ${
                        isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground'
                      }`}
                    >
                      {bucket.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </GuideBubble>
        );
      })}

      {/* Active filters summary */}
      {totalSelected > 0 && (
        <GuideBubble isNew>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{totalSelected}</span> filter
              {totalSelected !== 1 ? 's' : ''} active
            </p>
            <button
              onClick={onClearFacets}
              className="text-xs font-semibold text-primary hover:underline cursor-pointer flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> Clear all
            </button>
          </div>
        </GuideBubble>
      )}

      {/* Quick refine section */}
      {query && resultCount > 0 && (
        <div className="bg-gradient-to-br from-muted/50 to-muted/30 rounded-2xl p-4 border border-border mt-1">
          <div className="text-[10px] font-bold text-foreground uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-primary" /> Quick Refine
          </div>
          <div className="flex flex-wrap gap-1.5">
            {facets
              .slice(0, 3)
              .flatMap((f) =>
                f.buckets.slice(0, 2).map((b) => ({
                  field: f.field,
                  label: `${formatFieldName(f.field)}: ${b.key}`,
                  value: String(b.key),
                  isActive: (selectedFacets[f.field] || []).includes(String(b.key)),
                }))
              )
              .filter((chip) => !chip.isActive)
              .slice(0, 5)
              .map((chip) => (
                <button
                  key={chip.label}
                  onClick={() => onToggleFacet(chip.field, chip.value)}
                  className="bg-card border border-border rounded-full px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 hover:border-primary/20 transition-all cursor-pointer whitespace-nowrap"
                >
                  {chip.label}
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Journey */}
      <JourneyBreadcrumbs
        query={query}
        selectedFacets={selectedFacets}
        resultCount={resultCount}
      />
    </aside>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function AISearchPage() {
  const { isConfigured, settings } = useSettings();
  const exampleQueries = settings.exampleQueries ?? [];
  const searchState = useSearch();
  const { suggestions, fetchSuggestions, clearSuggestions } = useAutocomplete(200);
  const aiSummary = useAISummary();

  const [inputValue, setInputValue] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [guideCollapsed, setGuideCollapsed] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const lastSummaryQuery = useRef('');

  // Generate AI summary when results change
  useEffect(() => {
    if (
      searchState.query &&
      searchState.results.length >= 3 &&
      !searchState.isLoading &&
      searchState.query !== lastSummaryQuery.current
    ) {
      lastSummaryQuery.current = searchState.query;
      aiSummary.generate(searchState.query, searchState.results);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchState.query, searchState.results, searchState.isLoading]);

  const handleSearch = useCallback(
    async (q?: string) => {
      const query = (q ?? inputValue).trim();
      if (!query) return;
      setInputValue(query);
      clearSuggestions();
      setShowSuggestions(false);
      setSubmitted(true);
      lastSummaryQuery.current = '';
      aiSummary.reset();
      await searchState.search(query);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inputValue, searchState.search, clearSuggestions],
  );

  const handleInputChange = (value: string) => {
    setInputValue(value);
    if (value.trim().length >= 2) {
      fetchSuggestions(value);
      setShowSuggestions(true);
    } else {
      clearSuggestions();
      setShowSuggestions(false);
    }
  };

  const handleFollowUp = useCallback(
    (q: string) => {
      handleSearch(q);
    },
    [handleSearch],
  );

  return (
    <div className="min-h-screen">
      {/* ════════ HERO / SEARCH BAR ════════ */}
      <div
        className={`relative z-10 transition-all duration-500 ${
          submitted ? 'py-5' : 'py-14'
        }`}
      >
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0" />
          <div className="absolute inset-0" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-gradient-to-b from-primary/15 via-primary/5 to-transparent rounded-full blur-3xl" />
        </div>

        <div className="relative container mx-auto px-4 text-center">
          {!submitted && (
            <>
              <h1 className="animate-fade-in-up opacity-0 delay-200 text-3xl md:text-5xl font-bold tracking-tight mb-2">
                <span className="">AI-Powered Search</span>
              </h1>
              <p className="animate-fade-in-up opacity-0 delay-300 text-sm text-muted-foreground mb-6">
                Search naturally — we understand intent, not just keywords
              </p>
            </>
          )}

          {/* Search input */}
          <div
            className={`relative mx-auto transition-all duration-500 ${
              submitted ? 'max-w-2xl' : 'max-w-3xl'
            }`}
          >
            <div className="flex items-center gap-2 bg-card rounded-2xl px-4 py-1 shadow-lg border border-border focus-within:ring-2 focus-within:ring-ring/40 focus-within:border-primary transition-all">
              <Sparkles className="w-5 h-5 text-primary flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSearch();
                  if (e.key === 'Escape') {
                    setShowSuggestions(false);
                    clearSuggestions();
                  }
                }}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                placeholder={exampleQueries.length > 0 ? `Try: '${exampleQueries[0]}'${exampleQueries.length > 1 ? ` or '${exampleQueries[1]}'` : ''}` : "Search for anything..."}
                className="flex-1 h-12 bg-transparent text-foreground placeholder:text-muted-foreground text-sm focus:outline-none"
              />
              {inputValue && (
                <button
                  onClick={() => {
                    setInputValue('');
                    clearSuggestions();
                    inputRef.current?.focus();
                  }}
                  className="text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <Button
                onClick={() => handleSearch()}
                disabled={!inputValue.trim()}
                size="sm"
                className="rounded-xl cursor-pointer"
              >
                Search
              </Button>
              <SettingsModal />
            </div>

            {/* Autocomplete */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-30 top-full mt-2 w-full bg-card border border-border rounded-xl shadow-lg overflow-hidden">
                {suggestions.map((s) => (
                  <button
                    key={s.text}
                    onMouseDown={() => handleSearch(s.text)}
                    className="w-full px-4 py-3 text-left text-sm hover:bg-muted flex items-center gap-3 transition-colors cursor-pointer"
                  >
                    <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    {s.text}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Intent badge */}
          {submitted && searchState.query && (
            <div className="mt-3 flex items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full shadow-sm">
                <Sparkles className="w-3 h-3" /> AI Intent: {searchState.query}
              </span>
              {Object.keys(searchState.selectedFacets).length > 0 && (
                <span className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs font-semibold px-3 py-1 rounded-full">
                  {Object.values(searchState.selectedFacets).reduce(
                    (s, v) => s + v.length,
                    0,
                  )}{' '}
                  filters
                </span>
              )}
            </div>
          )}

          {/* Example chips */}
          {!submitted && exampleQueries.length > 0 && (
            <div className="animate-fade-in-up opacity-0 delay-500 flex gap-2 justify-center mt-5 flex-wrap">
              {exampleQueries.map(
                (q) => (
                  <button
                    key={q}
                    onClick={() => handleSearch(q)}
                    className="bg-card/70 backdrop-blur-sm border border-border rounded-full px-4 py-2 text-xs font-medium text-primary hover:bg-primary/10 hover:border-primary/20 transition-all cursor-pointer"
                  >
                    {q}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      </div>

      {/* ════════ NOT CONFIGURED ════════ */}
      {!isConfigured && (
        <div className="container mx-auto px-4 py-16 text-center">
          <Settings className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Configure connection</h2>
          <p className="text-muted-foreground mb-4">
            Set up your API URL and access token to get started.
          </p>
          <SettingsModal />
        </div>
      )}

      {/* ════════ MAIN CONTENT ════════ */}
      {submitted && isConfigured && (
        <div className="container mx-auto px-4 py-6 flex gap-6">
          {/* AI Guide Sidebar */}
          <AIGuideSidebar
            query={searchState.query}
            facets={searchState.facets}
            selectedFacets={searchState.selectedFacets}
            resultCount={searchState.pagination?.totalItems ?? 0}
            isLoading={searchState.isLoading}
            onToggleFacet={searchState.toggleFacet}
            onClearFacets={searchState.clearFacets}
            isCollapsed={guideCollapsed}
            onToggleCollapse={() => setGuideCollapsed((p) => !p)}
          />

          {/* Results area */}
          <main className="flex-1 min-w-0">
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="text-sm text-muted-foreground">
                {searchState.isLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Searching...
                  </span>
                ) : (
                  <>
                    <span className="font-bold text-foreground">
                      {searchState.pagination?.totalItems ?? 0}
                    </span>{' '}
                    results for &quot;{searchState.query}&quot;
                    {searchState.took > 0 && (
                      <span className="text-muted-foreground ml-1">
                        ({searchState.took}ms)
                      </span>
                    )}
                  </>
                )}
              </div>
              <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-md transition-all cursor-pointer ${
                    viewMode === 'grid'
                      ? 'bg-card shadow-sm text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-md transition-all cursor-pointer ${
                    viewMode === 'list'
                      ? 'bg-card shadow-sm text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <LayoutList className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* AI Summary */}
            {aiSummary.shouldShow && (
              <div className="mb-5 rounded-2xl bg-gradient-to-br from-muted/50 via-card to-muted/30 border border-border p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-md">
                    <Sparkles className="w-4 h-4 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">AI Summary</h3>
                    {aiSummary.isStreaming && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Analyzing
                        results...
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-sm text-foreground/80 leading-relaxed pl-12">
                  {aiSummary.isStreaming && !aiSummary.summary ? (
                    <div className="space-y-2">
                      <div className="h-3.5 bg-muted rounded-full w-full animate-pulse" />
                      <div className="h-3.5 bg-muted rounded-full w-5/6 animate-pulse" />
                      <div className="h-3.5 bg-muted rounded-full w-3/5 animate-pulse" />
                    </div>
                  ) : (
                    <>
                      {aiSummary.summary}
                      {aiSummary.isStreaming && (
                        <span className="inline-block w-0.5 h-4 bg-foreground ml-0.5 animate-pulse align-middle" />
                      )}
                    </>
                  )}
                </div>
                {aiSummary.isComplete && aiSummary.followUpQueries.length > 0 && (
                  <div className="pl-12 mt-3 flex flex-wrap gap-2">
                    <span className="text-xs font-medium text-muted-foreground self-center">
                      Try:
                    </span>
                    {aiSummary.followUpQueries.map((q) => (
                      <button
                        key={q}
                        onClick={() => handleFollowUp(q)}
                        className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors cursor-pointer"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Results */}
            {searchState.isLoading && searchState.results.length === 0 ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : searchState.results.length === 0 && !searchState.isLoading ? (
              <div className="text-center py-20">
                <Search className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-muted-foreground">
                  No results found. Try a different search or adjust filters.
                </p>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {searchState.results.map((result) => (
                  <DynamicResultCard
                    key={result.id}
                    result={result}
                    displayConfig={searchState.displayConfig}
                    viewMode="grid"
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {searchState.results.map((result) => (
                  <DynamicResultCard
                    key={result.id}
                    result={result}
                    displayConfig={searchState.displayConfig}
                    viewMode="list"
                  />
                ))}
              </div>
            )}

            {/* Pagination */}
            {searchState.pagination && searchState.pagination.totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!searchState.pagination.hasPreviousPage}
                  onClick={() =>
                    searchState.setPage(searchState.pagination!.page - 1)
                  }
                  className="cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-muted-foreground px-3">
                  Page {searchState.pagination.page} of{' '}
                  {searchState.pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!searchState.pagination.hasNextPage}
                  onClick={() =>
                    searchState.setPage(searchState.pagination!.page + 1)
                  }
                  className="cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}

            {/* Bottom refine bar */}
            {searchState.results.length > 0 && searchState.facets.length > 0 && (
              <div className="mt-6 p-4 bg-gradient-to-br from-muted/50 to-muted/30 rounded-2xl border border-border flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5 text-primary-foreground" />
                  </div>
                  <span className="text-xs font-bold text-foreground">
                    Refine with AI
                  </span>
                </div>
                <div className="flex gap-2 flex-wrap flex-1">
                  {searchState.facets
                    .slice(0, 3)
                    .flatMap((f) =>
                      f.buckets.slice(0, 2).map((b) => ({
                        field: f.field,
                        value: String(b.key),
                        isActive: (
                          searchState.selectedFacets[f.field] || []
                        ).includes(String(b.key)),
                      }))
                    )
                    .filter((c) => !c.isActive)
                    .slice(0, 4)
                    .map((chip) => (
                      <button
                        key={`${chip.field}-${chip.value}`}
                        onClick={() =>
                          searchState.toggleFacet(chip.field, chip.value)
                        }
                        className="bg-card border border-border rounded-full px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 hover:border-primary/20 transition-all cursor-pointer whitespace-nowrap"
                      >
                        {chip.value}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
