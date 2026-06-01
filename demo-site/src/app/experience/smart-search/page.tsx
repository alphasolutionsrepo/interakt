'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Search,
  ArrowRight,
  X,
  LayoutGrid,
  LayoutList,
  Loader2,
  Check,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Settings,
  Brain,
  TrendingUp,
  Eye,
  RotateCcw,
  Lightbulb,
  History,
  Target,
} from 'lucide-react';

import { useSettings } from '@/contexts/settings-context';
import { useSearch } from '@/hooks/use-search';
import { useAutocomplete } from '@/hooks/use-autocomplete';
import { useAISummary } from '@/hooks/use-ai-summary';
import { DynamicResultCard } from '../../search-interface/components/DynamicResultCard';
import { SettingsModal } from '../../search-interface/components/SettingsModal';
import { useSessionMemory, type SuggestedFilter } from './use-session-memory';
import type { SearchResult, Facet } from '@/lib/api/types';

// ============================================================================
// SESSION INSIGHT BANNER
// ============================================================================

function InsightBanner({ insight, searchDepth }: { insight: string | null; searchDepth: number }) {
  if (!insight) return null;

  return (
    <div className="mb-4 rounded-xl bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 border border-primary/20 px-4 py-3 flex items-center gap-3 animate-fade-in-up">
      <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
        <Brain className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-primary mb-0.5 flex items-center gap-1.5">
          <Eye className="w-3 h-3" />
          Session insight · {searchDepth} searches
        </div>
        <p className="text-sm text-foreground/80">{insight}</p>
      </div>
    </div>
  );
}

// ============================================================================
// SUGGESTED FILTERS
// ============================================================================

function SuggestedFilters({
  suggestions,
  onApply,
}: {
  suggestions: SuggestedFilter[];
  onApply: (field: string, value: string) => void;
}) {
  if (suggestions.length === 0) return null;

  const confIcon = {
    high: <Target className="w-3 h-3" />,
    medium: <TrendingUp className="w-3 h-3" />,
    low: <Lightbulb className="w-3 h-3" />,
  };

  const confColor = {
    high: 'bg-primary text-primary-foreground border-primary shadow-sm',
    medium: 'bg-primary/15 text-primary border-primary/30',
    low: 'bg-muted text-foreground border-border',
  };

  return (
    <div className="mb-4">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <Sparkles className="w-3 h-3 text-primary" />
        Suggested for you
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={`${s.field}:${s.value}`}
            onClick={() => onApply(s.field, s.value)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer hover:scale-105 active:scale-95 ${confColor[s.confidence]}`}
            title={s.reason}
          >
            {confIcon[s.confidence]}
            {s.value}
            <span className="opacity-60 text-[10px] font-normal hidden sm:inline">
              {s.reason}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// SEARCH HISTORY CHIPS
// ============================================================================

function SearchHistory({
  searches,
  onRerun,
}: {
  searches: { query: string; resultCount: number }[];
  onRerun: (query: string) => void;
}) {
  if (searches.length < 2) return null;

  // Show last 5 unique queries (excluding current)
  const unique = [...new Map(searches.map((s) => [s.query, s])).values()].slice(-6, -1).reverse();
  if (unique.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <History className="w-3 h-3" />
        Recent searches
      </div>
      <div className="flex flex-wrap gap-1.5">
        {unique.map((s) => (
          <button
            key={s.query}
            onClick={() => onRerun(s.query)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all cursor-pointer"
          >
            <Search className="w-3 h-3" />
            {s.query}
            <span className="text-[10px] opacity-60">{s.resultCount}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// FACET PILLS (session-aware ordering)
// ============================================================================

function FacetPills({
  facets,
  selectedFacets,
  onToggle,
  onClear,
}: {
  facets: Facet[];
  selectedFacets: Record<string, string[]>;
  onToggle: (field: string, value: string) => void;
  onClear: () => void;
}) {
  const [expandedField, setExpandedField] = useState<string | null>(null);
  const totalSelected = Object.values(selectedFacets).reduce((s, v) => s + v.length, 0);

  const formatFieldName = (field: string): string => {
    const name = field.split('.').pop() || field;
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  };

  if (facets.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Filters
        </div>
        {totalSelected > 0 && (
          <button
            onClick={onClear}
            className="text-xs font-semibold text-primary hover:underline cursor-pointer flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" /> Clear {totalSelected}
          </button>
        )}
      </div>

      {/* Active filters */}
      {totalSelected > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {Object.entries(selectedFacets).flatMap(([field, values]) =>
            values.map((val) => (
              <button
                key={`${field}:${val}`}
                onClick={() => onToggle(field, val)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-primary text-primary-foreground cursor-pointer hover:bg-primary/80 transition-colors"
              >
                {val}
                <X className="w-3 h-3" />
              </button>
            )),
          )}
        </div>
      )}

      {/* Facet field tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {facets.slice(0, 6).map((facet) => {
          const isExpanded = expandedField === facet.field;
          const selectedCount = (selectedFacets[facet.field] || []).length;

          return (
            <div key={facet.field} className="relative">
              <button
                onClick={() => setExpandedField(isExpanded ? null : facet.field)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                  isExpanded
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : selectedCount > 0
                    ? 'bg-primary/5 text-primary border-primary/20'
                    : 'bg-card text-foreground border-border hover:border-primary/20'
                }`}
              >
                {formatFieldName(facet.field)}
                {selectedCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">
                    {selectedCount}
                  </span>
                )}
              </button>

              {/* Dropdown */}
              {isExpanded && (
                <div className="absolute z-20 top-full mt-1 left-0 bg-card border border-border rounded-xl shadow-lg p-2 min-w-[180px] max-h-64 overflow-y-auto">
                  {facet.buckets.slice(0, 12).map((bucket) => {
                    const val = String(bucket.key);
                    const isSelected = (selectedFacets[facet.field] || []).includes(val);
                    return (
                      <button
                        key={val}
                        onClick={() => {
                          onToggle(facet.field, val);
                        }}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-primary/10 text-primary font-semibold'
                            : 'hover:bg-muted text-foreground'
                        }`}
                      >
                        <span className="flex items-center gap-2 truncate">
                          {isSelected && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                          <span className="truncate">{val}</span>
                        </span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {bucket.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function SmartSearchPage() {
  const { isConfigured, settings } = useSettings();
  const exampleQueries = settings.exampleQueries ?? [];
  const searchState = useSearch();
  const { suggestions, fetchSuggestions, clearSuggestions } = useAutocomplete(200);
  const aiSummary = useAISummary();
  const session = useSessionMemory();

  const [inputValue, setInputValue] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const inputRef = useRef<HTMLInputElement>(null);
  const lastSummaryQuery = useRef('');

  // Reorder facets based on session memory
  const smartFacets = useMemo(
    () => session.getPreferredFacetOrder(searchState.facets),
    [searchState.facets, session.getPreferredFacetOrder, session.memory.patterns],
  );

  // Get suggested filters from session patterns + current facet data
  const suggestedFilters = useMemo(
    () => session.getSuggestedFilters(searchState.facets, searchState.selectedFacets),
    [searchState.facets, searchState.selectedFacets, session.getSuggestedFilters, session.memory.patterns],
  );

  // Get session insight
  const insight = useMemo(() => session.getInsight(), [session.getInsight, session.memory.patterns]);

  // Get suggested queries
  const suggestedQueries = useMemo(
    () => session.getSuggestedQueries(),
    [session.getSuggestedQueries, session.memory.patterns],
  );

  // Async AI summary — fire after results render
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

  // Record search in session memory when results arrive
  const lastRecordedQuery = useRef('');
  useEffect(() => {
    if (
      searchState.query &&
      !searchState.isLoading &&
      searchState.results.length > 0 &&
      searchState.query !== lastRecordedQuery.current
    ) {
      lastRecordedQuery.current = searchState.query;
      session.recordSearch(
        searchState.query,
        searchState.pagination?.totalItems ?? searchState.results.length,
        searchState.facets,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchState.query, searchState.isLoading, searchState.results]);

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

  const handleToggleFacet = useCallback(
    (field: string, value: string) => {
      session.recordFacetSelection(field, value, searchState.query);
      searchState.toggleFacet(field, value);
    },
    [searchState.toggleFacet, searchState.query, session.recordFacetSelection],
  );

  const handleResultClick = useCallback(
    (result: SearchResult, position: number) => {
      session.recordClick(result, searchState.query, position);
    },
    [searchState.query, session.recordClick],
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

  const handleStartOver = useCallback(() => {
    searchState.reset();
    aiSummary.reset();
    session.reset();
    setInputValue('');
    setSubmitted(false);
    lastSummaryQuery.current = '';
    lastRecordedQuery.current = '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchState.reset, aiSummary.reset, session.reset]);

  return (
    <div className="min-h-screen">
      {/* ════════ HEADER ════════ */}
      <div
        className={`relative overflow-hidden transition-all duration-500 ${
          submitted ? 'py-5' : 'py-14'
        }`}
      >
        <div className="absolute inset-0" />
        <div className="absolute inset-0" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-gradient-to-b from-primary/15 via-primary/5 to-transparent rounded-full blur-3xl" />

        <div className="relative container mx-auto px-4 text-center">
          {!submitted && (
            <>
              <h1 className="animate-fade-in-up opacity-0 delay-200 text-3xl md:text-5xl font-bold tracking-tight mb-2">
                <span className="">Smart Search</span>
              </h1>
              <p className="animate-fade-in-up opacity-0 delay-300 text-sm text-muted-foreground mb-6">
                Search gets smarter as you explore — learning your preferences in real time
              </p>
            </>
          )}

          {/* Search bar */}
          <div
            className={`relative mx-auto transition-all duration-500 ${
              submitted ? 'max-w-2xl' : 'max-w-3xl'
            }`}
          >
            <div className="flex items-center gap-2 bg-card rounded-2xl px-4 py-1 shadow-lg border border-border focus-within:ring-2 focus-within:ring-ring/40 focus-within:border-primary transition-all">
              <Search className="w-5 h-5 text-muted-foreground flex-shrink-0" />
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
                placeholder="Search for anything..."
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
                {/* Session-based query suggestions in autocomplete */}
                {suggestedQueries.length > 0 && (
                  <>
                    <div className="border-t border-border" />
                    <div className="px-4 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Based on your session
                    </div>
                    {suggestedQueries.map((q) => (
                      <button
                        key={q}
                        onMouseDown={() => handleSearch(q)}
                        className="w-full px-4 py-3 text-left text-sm hover:bg-muted flex items-center gap-3 transition-colors cursor-pointer"
                      >
                        <Brain className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                        <span className="text-primary font-medium">{q}</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Session activity indicator */}
          {submitted && session.memory.patterns.searchDepth > 0 && (
            <div className="mt-3 flex items-center justify-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Brain className="w-3 h-3 text-primary" />
                {session.memory.patterns.searchDepth} search{session.memory.patterns.searchDepth !== 1 ? 'es' : ''}
                {session.memory.clicks.length > 0 && (
                  <> · {session.memory.clicks.length} click{session.memory.clicks.length !== 1 ? 's' : ''}</>
                )}
                {session.memory.patterns.usesFacets && <> · using filters</>}
              </span>
              {session.memory.patterns.searchDepth >= 2 && (
                <button
                  onClick={handleStartOver}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" /> Reset session
                </button>
              )}
            </div>
          )}

          {/* Example chips — only pre-search */}
          {!submitted && exampleQueries.length > 0 && (
            <div className="animate-fade-in-up opacity-0 delay-500 flex gap-2 justify-center mt-5 flex-wrap">
              {exampleQueries.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSearch(q)}
                  className="bg-card/70 backdrop-blur-sm border border-border rounded-full px-4 py-2 text-xs font-medium text-primary hover:bg-primary/10 hover:border-primary/20 transition-all cursor-pointer"
                >
                  {q}
                </button>
              ))}
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

      {/* ════════ RESULTS ════════ */}
      {submitted && isConfigured && (
        <div className="container mx-auto px-4 py-6 max-w-5xl">
          {/* Session insight */}
          <InsightBanner insight={insight} searchDepth={session.memory.patterns.searchDepth} />

          {/* Suggested filters (from session memory) */}
          <SuggestedFilters suggestions={suggestedFilters} onApply={handleToggleFacet} />

          {/* Facet pills */}
          <FacetPills
            facets={smartFacets}
            selectedFacets={searchState.selectedFacets}
            onToggle={handleToggleFacet}
            onClear={searchState.clearFacets}
          />

          {/* Search history */}
          <SearchHistory
            searches={session.memory.searches.map((s) => ({
              query: s.query,
              resultCount: s.resultCount,
            }))}
            onRerun={handleSearch}
          />

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

          {/* AI Summary (async — streams in after results) */}
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
                      <Loader2 className="w-3 h-3 animate-spin" /> Analyzing results...
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
                      onClick={() => handleSearch(q)}
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
                No results found. Try a different search or adjust your filters.
              </p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {searchState.results.map((result, i) => (
                <div key={result.id} onClick={() => handleResultClick(result, i)}>
                  <DynamicResultCard
                    result={result}
                    displayConfig={searchState.displayConfig}
                    viewMode="grid"
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {searchState.results.map((result, i) => (
                <div key={result.id} onClick={() => handleResultClick(result, i)}>
                  <DynamicResultCard
                    result={result}
                    displayConfig={searchState.displayConfig}
                    viewMode="list"
                  />
                </div>
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
                onClick={() => searchState.setPage(searchState.pagination!.page - 1)}
                className="cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-muted-foreground px-3">
                Page {searchState.pagination.page} of {searchState.pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!searchState.pagination.hasNextPage}
                onClick={() => searchState.setPage(searchState.pagination!.page + 1)}
                className="cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
