'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Search,
  ArrowRight,
  ArrowLeft,
  Settings,
  Sparkles,
  X,
  Check,
  Loader2,
  SkipForward,
  RotateCcw,
} from 'lucide-react';

import { useSettings } from '@/contexts/settings-context';
import { useSearch } from '@/hooks/use-search';
import { useAutocomplete } from '@/hooks/use-autocomplete';
import { useAISummary } from '@/hooks/use-ai-summary';
import { DynamicResultCard } from '../../search-interface/components/DynamicResultCard';
import { SettingsModal } from '../../search-interface/components/SettingsModal';

// ============================================================================
// TYPES
// ============================================================================

type Step = 'intent' | 'refine' | 'results';

const STEPS: { key: Step; label: string }[] = [
  { key: 'intent', label: 'Search' },
  { key: 'refine', label: 'Refine' },
  { key: 'results', label: 'Results' },
];

// ============================================================================
// STEP INDICATOR
// ============================================================================

function StepIndicator({ current, onGoTo }: { current: Step; onGoTo: (step: Step) => void }) {
  const currentIndex = STEPS.findIndex((s) => s.key === current);

  return (
    <div className="flex items-center justify-center gap-2">
      {STEPS.map((step, i) => {
        const isComplete = i < currentIndex;
        const isCurrent = step.key === current;
        const isClickable = i < currentIndex;

        return (
          <div key={step.key} className="flex items-center gap-2">
            {i > 0 && (
              <div
                className={`hidden sm:block w-12 h-px transition-colors ${
                  i <= currentIndex ? 'bg-primary' : 'bg-border'
                }`}
              />
            )}
            <button
              onClick={() => isClickable && onGoTo(step.key)}
              disabled={!isClickable}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                isCurrent
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : isComplete
                  ? 'bg-primary/10 text-primary cursor-pointer hover:bg-primary/20'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {isComplete ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <span className="w-5 h-5 rounded-full bg-current/10 flex items-center justify-center text-xs">
                  {i + 1}
                </span>
              )}
              <span className="hidden sm:inline">{step.label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// INTENT STEP
// ============================================================================

function IntentStep({
  onSearch,
  initialQuery,
  exampleQueries,
}: {
  onSearch: (query: string) => void;
  initialQuery: string;
  exampleQueries: string[];
}) {
  const [query, setQuery] = useState(initialQuery);
  const { suggestions, fetchSuggestions, clearSuggestions } = useAutocomplete(200);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (q?: string) => {
    const searchQuery = (q ?? query).trim();
    if (!searchQuery) return;
    clearSuggestions();
    setShowSuggestions(false);
    onSearch(searchQuery);
  };

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (value.trim().length >= 2) {
      fetchSuggestions(value);
      setShowSuggestions(true);
    } else {
      clearSuggestions();
      setShowSuggestions(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto text-center">
      <div className="mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary mb-4">
          <Search className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold mb-2">What are you looking for?</h2>
        <p className="text-muted-foreground">
          Start by describing what you need. We&apos;ll help you narrow it down step by step.
        </p>
      </div>

      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit();
                if (e.key === 'Escape') {
                  setShowSuggestions(false);
                  clearSuggestions();
                }
              }}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder={exampleQueries.length > 0 ? `e.g., ${exampleQueries.join(', ')}...` : "What are you looking for?"}
              className="w-full h-12 px-4 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary transition-all"
            />
            {query && (
              <button
                onClick={() => {
                  setQuery('');
                  clearSuggestions();
                  inputRef.current?.focus();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <Button
            onClick={() => handleSubmit()}
            disabled={!query.trim()}
            className="h-12 px-6 rounded-xl cursor-pointer"
          >
            Search
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>

        {/* Autocomplete dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-20 top-full mt-2 w-full bg-card border border-border rounded-xl shadow-lg overflow-hidden">
            {suggestions.map((s) => (
              <button
                key={s.text}
                onMouseDown={() => {
                  setQuery(s.text);
                  handleSubmit(s.text);
                }}
                className="w-full px-4 py-3 text-left text-sm hover:bg-muted flex items-center gap-3 transition-colors cursor-pointer"
              >
                <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                {s.text}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// REFINE STEP
// ============================================================================

function RefineStep({
  facets,
  selectedFacets,
  onToggle,
  onNext,
  onBack,
  totalResults,
  isLoading,
}: {
  facets: { field: string; type: string; buckets: { key: string | number; count: number }[] }[];
  selectedFacets: Record<string, string[]>;
  onToggle: (field: string, value: string) => void;
  onNext: () => void;
  onBack: () => void;
  totalResults: number;
  isLoading: boolean;
}) {
  const totalSelected = Object.values(selectedFacets).reduce((sum, v) => sum + v.length, 0);

  // Pretty-print a facet field name
  const formatFieldName = (field: string): string => {
    const name = field.split('.').pop() || field;
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  };

  if (facets.length === 0 && !isLoading) {
    return (
      <div className="max-w-2xl mx-auto text-center">
        <p className="text-muted-foreground mb-6">No filters available for this search. Let&apos;s go straight to results.</p>
        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={onBack} className="cursor-pointer">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <Button onClick={onNext} className="cursor-pointer">
            View Results <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Narrow your search</h2>
        <p className="text-muted-foreground">
          {totalResults > 0 ? (
            <>
              We found <span className="font-semibold text-foreground">{totalResults}</span> results.
              {' '}Select filters to narrow them down.
            </>
          ) : (
            'Select filters to refine your results.'
          )}
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-6">
          {facets.slice(0, 5).map((facet) => {
            const selected = selectedFacets[facet.field] || [];
            return (
              <div key={facet.field}>
                <h3 className="text-sm font-semibold text-foreground mb-3">
                  {formatFieldName(facet.field)}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {facet.buckets.slice(0, 12).map((bucket) => {
                    const val = String(bucket.key);
                    const isSelected = selected.includes(val);
                    return (
                      <button
                        key={val}
                        onClick={() => onToggle(facet.field, val)}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                            : 'bg-card border-border text-foreground hover:border-primary/40 hover:bg-muted'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                        {val}
                        <span className={`text-xs ${isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                          ({bucket.count})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between mt-10 pt-6 border-t border-border">
        <Button variant="outline" onClick={onBack} className="cursor-pointer">
          <ArrowLeft className="w-4 h-4 mr-1" /> Change search
        </Button>
        <div className="flex items-center gap-3">
          {totalSelected > 0 && (
            <span className="text-sm text-muted-foreground">
              {totalSelected} filter{totalSelected !== 1 ? 's' : ''} selected
            </span>
          )}
          <Button onClick={onNext} className="cursor-pointer">
            View Results <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// RESULTS STEP
// ============================================================================

function ResultsStep({
  query,
  results,
  displayConfig,
  pagination,
  isLoading,
  selectedFacets,
  onBack,
  onStartOver,
  onPageChange,
}: {
  query: string;
  results: import('@/lib/api/types').SearchResult[];
  displayConfig: import('@/lib/api/types').DisplayConfig | null;
  pagination: import('@/lib/api/types').Pagination | null;
  isLoading: boolean;
  selectedFacets: Record<string, string[]>;
  onBack: () => void;
  onStartOver: () => void;
  onPageChange: (page: number) => void;
}) {
  const aiSummary = useAISummary();
  const lastQueryRef = useRef('');
  const totalFilters = Object.values(selectedFacets).reduce((sum, v) => sum + v.length, 0);

  // Generate AI summary on first render with results
  useEffect(() => {
    if (query && results.length >= 3 && query !== lastQueryRef.current) {
      lastQueryRef.current = query;
      aiSummary.generate(query, results);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, results]);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <span>Searching for</span>
          <span className="font-semibold text-foreground">&quot;{query}&quot;</span>
          {totalFilters > 0 && (
            <>
              <span>with</span>
              <span className="font-semibold text-foreground">
                {totalFilters} filter{totalFilters !== 1 ? 's' : ''}
              </span>
            </>
          )}
        </div>
        {pagination && (
          <p className="text-sm text-muted-foreground">
            {pagination.totalItems} result{pagination.totalItems !== 1 ? 's' : ''} found
          </p>
        )}
      </div>

      {/* AI Summary */}
      {aiSummary.shouldShow && (
        <div className="mb-6 rounded-2xl bg-gradient-to-br from-muted/50 via-card to-muted/30 border border-border p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-md">
              <Sparkles className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">AI Summary</h3>
              {aiSummary.isStreaming && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Analyzing...
                </p>
              )}
            </div>
          </div>
          <div className="text-sm text-foreground/80 leading-relaxed pl-12">
            {aiSummary.summary}
            {aiSummary.isStreaming && (
              <span className="inline-block w-0.5 h-4 bg-foreground ml-0.5 animate-pulse align-middle" />
            )}
          </div>
          {aiSummary.isComplete && aiSummary.followUpQueries.length > 0 && (
            <div className="pl-12 mt-3 flex flex-wrap gap-2">
              <span className="text-xs font-medium text-muted-foreground self-center">Related:</span>
              {aiSummary.followUpQueries.map((q) => (
                <span
                  key={q}
                  className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium bg-primary/10 text-primary border border-primary/20"
                >
                  {q}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : results.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground mb-4">No results found. Try adjusting your filters or search query.</p>
          <Button variant="outline" onClick={onStartOver} className="cursor-pointer">
            <RotateCcw className="w-4 h-4 mr-1" /> Start Over
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {results.map((result) => (
            <DynamicResultCard
              key={result.id}
              result={result}
              displayConfig={displayConfig}
              viewMode="list"
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <Button
            variant="outline"
            size="sm"
            disabled={!pagination.hasPreviousPage}
            onClick={() => onPageChange(pagination.page - 1)}
            className="cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground px-3">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!pagination.hasNextPage}
            onClick={() => onPageChange(pagination.page + 1)}
            className="cursor-pointer"
          >
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between mt-10 pt-6 border-t border-border">
        <Button variant="outline" onClick={onBack} className="cursor-pointer">
          <ArrowLeft className="w-4 h-4 mr-1" /> Adjust filters
        </Button>
        <Button variant="outline" onClick={onStartOver} className="cursor-pointer">
          <RotateCcw className="w-4 h-4 mr-1" /> Start over
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function GuidedSearchPage() {
  const { isConfigured, settings } = useSettings();
  const exampleQueries = settings.exampleQueries ?? [];
  const searchState = useSearch();
  const [step, setStep] = useState<Step>('intent');

  const handleSearch = useCallback(
    async (query: string) => {
      await searchState.search(query);
      setStep('refine');
    },
    [searchState.search],
  );

  const handleToggleFacet = useCallback(
    (field: string, value: string) => {
      searchState.toggleFacet(field, value);
    },
    [searchState.toggleFacet],
  );

  const handleGoToStep = useCallback((target: Step) => {
    setStep(target);
  }, []);

  const handleStartOver = useCallback(() => {
    searchState.reset();
    setStep('intent');
  }, [searchState.reset]);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-30">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold tracking-tight">Guided Search</h1>
          <div className="flex items-center gap-2">
            <StepIndicator current={step} onGoTo={handleGoToStep} />
            <div className="ml-4">
              <SettingsModal />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-12">
        {!isConfigured ? (
          <div className="max-w-md mx-auto text-center py-16">
            <Settings className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Configure connection</h2>
            <p className="text-muted-foreground mb-4">
              Set up your API URL and access token to get started.
            </p>
            <SettingsModal />
          </div>
        ) : (
          <>
            {step === 'intent' && (
              <IntentStep onSearch={handleSearch} initialQuery={searchState.query} exampleQueries={exampleQueries} />
            )}

            {step === 'refine' && (
              <RefineStep
                facets={searchState.facets}
                selectedFacets={searchState.selectedFacets}
                onToggle={handleToggleFacet}
                onNext={() => setStep('results')}
                onBack={() => setStep('intent')}
                totalResults={searchState.pagination?.totalItems ?? 0}
                isLoading={searchState.isLoading}
              />
            )}

            {step === 'results' && (
              <ResultsStep
                query={searchState.query}
                results={searchState.results}
                displayConfig={searchState.displayConfig}
                pagination={searchState.pagination}
                isLoading={searchState.isLoading}
                selectedFacets={searchState.selectedFacets}
                onBack={() => setStep('refine')}
                onStartOver={handleStartOver}
                onPageChange={searchState.setPage}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
