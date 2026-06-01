'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  LayoutGrid,
  LayoutList,
  ChevronLeft,
  ChevronRight,
  Search,
  AlertCircle,
  Settings,
  X,
  SlidersHorizontal,
  ArrowRight,
  Eye,
  EyeOff,
  Database,
} from 'lucide-react';
import { useSettings } from '@/contexts/settings-context';
import { useSearch } from '@/hooks/use-search';
import { useAutocomplete } from '@/hooks/use-autocomplete';
import { StreamingAISummary } from './components/StreamingAISummary';
import { DynamicResultCard } from './components/DynamicResultCard';
import { FacetSidebar } from './components/FacetSidebar';
import { SettingsModal } from './components/SettingsModal';
// ============================================================================
// SEARCH PAGE COMPONENT
// ============================================================================

export default function SearchInterfacePage() {
  return <SearchPageContent />;
}

// ============================================================================
// SEARCH PAGE CONTENT
// ============================================================================

function SearchPageContent() {
  const { isConfigured, settings } = useSettings();
  const {
    query,
    results,
    facets,
    pagination,
    displayConfig,
    isLoading,
    error,
    selectedFacets,
    took,
    indexesSearched,
    search,
    setPage,
    toggleFacet,
    clearFacets,
  } = useSearch();

  const [searchInput, setSearchInput] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [showScores, setShowScores] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Autocomplete hook
  const {
    suggestions,
    isLoading: isAutocompleteLoading,
    fetchSuggestions,
    clearSuggestions,
  } = useAutocomplete(150);

  // Determine if we have results to show (for layout transitions)
  const hasResults = results.length > 0 || (query && pagination);

  // Handle search form submission
  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (searchInput.trim()) {
        search(searchInput.trim());
        setShowAutocomplete(false);
        clearSuggestions();
      }
    },
    [searchInput, search, clearSuggestions]
  );

  // Handle input change with autocomplete
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setSearchInput(value);
      setSelectedSuggestionIndex(-1);

      if (value.trim().length >= 2) {
        fetchSuggestions(value);
        setShowAutocomplete(true);
      } else {
        clearSuggestions();
        setShowAutocomplete(false);
      }
    },
    [fetchSuggestions, clearSuggestions]
  );

  // Handle suggestion selection
  const handleSuggestionSelect = useCallback(
    (suggestionText: string) => {
      setSearchInput(suggestionText);
      search(suggestionText);
      setShowAutocomplete(false);
      clearSuggestions();
      setSelectedSuggestionIndex(-1);
    },
    [search, clearSuggestions]
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!showAutocomplete || suggestions.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedSuggestionIndex((prev) =>
            prev < suggestions.length - 1 ? prev + 1 : prev
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedSuggestionIndex((prev) => (prev > 0 ? prev - 1 : -1));
          break;
        case 'Enter':
          if (selectedSuggestionIndex >= 0) {
            e.preventDefault();
            handleSuggestionSelect(suggestions[selectedSuggestionIndex].text);
          }
          break;
        case 'Escape':
          setShowAutocomplete(false);
          setSelectedSuggestionIndex(-1);
          break;
      }
    },
    [showAutocomplete, suggestions, selectedSuggestionIndex, handleSuggestionSelect]
  );

  // Close autocomplete when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setShowAutocomplete(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Convert facets to sidebar format
  const facetsObject = facets.reduce(
    (acc, facet) => {
      acc[facet.field] = {
        field: facet.field,
        type: facet.type,
        buckets: facet.buckets.map((b) => ({
          key: String(b.key),
          count: b.count,
        })),
      };
      return acc;
    },
    {} as Record<string, { field: string; type: string; buckets: { key: string; count: number }[] }>
  );

  // Handle facet changes from sidebar
  const handleFacetChange = (facetKey: string, values: string[]) => {
    const currentValues = selectedFacets[facetKey] || [];

    for (const value of values) {
      if (!currentValues.includes(value)) {
        toggleFacet(facetKey, value);
      }
    }

    for (const value of currentValues) {
      if (!values.includes(value)) {
        toggleFacet(facetKey, value);
      }
    }
  };

  const getTotalSelectedFacets = () => {
    return Object.values(selectedFacets).reduce((sum, arr) => sum + arr.length, 0);
  };

  const handleFollowUpSearch = (followUpQuery: string) => {
    setSearchInput(followUpQuery);
    search(followUpQuery);
  };

  const getFacetDisplayName = (fieldName: string) => {
    const displayNames: Record<string, string> = {
      brand: 'Brand', categories: 'Categories', category: 'Category',
      availability: 'Availability', priceRange: 'Price Range', collections: 'Collections',
      colors: 'Colors', primaryColor: 'Color', materials: 'Materials', material: 'Material',
      size: 'Size', type: 'Type', gender: 'Gender', ageGroup: 'Age Group',
      season: 'Season', style: 'Style', subCategory: 'Sub Category', inStock: 'Availability',
      language: 'Language', currency: 'Currency', rating: 'Rating',
    };
    return displayNames[fieldName] || fieldName
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  };

  // Generate refinement chips from top facet values (not already selected)
  const refinementChips = facets
    .filter(f => f.buckets.length > 0)
    .slice(0, 3)
    .flatMap(f =>
      f.buckets
        .filter(b => !(selectedFacets[f.field] || []).includes(String(b.key)))
        .slice(0, 2)
        .map(b => ({
          facetField: f.field,
          value: String(b.key),
          label: `${String(b.key)}`,
          count: b.count,
          displayField: getFacetDisplayName(f.field),
        }))
    )
    .slice(0, 6);

  // Show configuration prompt if not configured
  if (!isConfigured) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4 relative">
        {/* Background gradient */}
        <div className="absolute inset-0 opacity-50" />
        <div className="absolute inset-0" />

        <div className="relative max-w-md w-full">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary mb-6 shadow-lg">
              <Search className="w-8 h-8 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-semibold text-foreground mb-2">
              Configure Search
            </h1>
            <p className="text-muted-foreground">
              Connect your API to start searching your data.
            </p>
          </div>

          <div className="bg-card rounded-2xl border border-border shadow-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Settings className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">API Configuration</p>
                <p className="text-sm text-muted-foreground">Enter your API URL and access token</p>
              </div>
            </div>
            <SettingsModal />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Search Section - Expands/Contracts based on results */}
      <div className={`
        relative z-20
        transition-all duration-700 ease-out
        ${hasResults ? 'py-5 bg-background border-b border-border/50' : 'py-20 md:py-32'}
      `}>
        {/* Background gradient - only show when no results */}
        {!hasResults && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute inset-0" />
            <div className="absolute inset-0" />
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-gradient-to-br from-primary/20 to-transparent rounded-full blur-3xl" />
            <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-gradient-to-tl from-primary/15 to-transparent rounded-full blur-3xl" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] from-primary/10 to-transparent rounded-full" />
          </div>
        )}

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header - Only show prominently when no results */}
          <div className={`
            text-center transition-all duration-500
            ${hasResults ? 'mb-4' : 'mb-10 md:mb-14'}
          `}>
            {!hasResults && (
              <>
                {/* Badge */}
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-sm font-medium text-primary">Powered by AI</span>
                </div>

                {/* Main headline with gradient */}
                <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
                  <span className="text-foreground">
                    Search
                  </span>
                  <br className="sm:hidden" />
                  <span className="">
                    {' '}smarter
                  </span>
                </h1>

                {/* Subheadline */}
                <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                  Experience lightning-fast search with AI-powered insights.
                  <br className="hidden sm:block" />
                  <span className="text-muted-foreground/70"> Find exactly what you need, instantly.</span>
                </p>

                {/* Example Query Chips */}
                {settings.exampleQueries && settings.exampleQueries.length > 0 && (
                  <div className="flex flex-wrap gap-2 justify-center mt-6">
                    <span className="text-sm text-muted-foreground self-center mr-1">Try:</span>
                    {settings.exampleQueries.map((q) => (
                      <button
                        type="button"
                        key={q}
                        onClick={() => {
                          setSearchInput(q);
                          search(q);
                        }}
                        className="inline-flex items-center rounded-full px-4 py-2 text-sm font-medium bg-card/80 backdrop-blur-sm text-foreground border border-border/50 hover:border-primary/30 hover:bg-primary/10 hover:text-primary transition-all cursor-pointer"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Search Bar - Premium glossy design */}
          <form onSubmit={handleSearch} className={`
            relative z-50 mx-auto transition-all duration-500
            ${hasResults ? 'max-w-4xl' : 'max-w-3xl'}
          `}>
            {/* Search container with autocomplete */}
            <div
              ref={searchContainerRef}
              className="relative z-50"
            >
              {/* Outer glow effect - only when no results */}
              {!hasResults && (
                <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 rounded-full blur-lg opacity-70" />
              )}

              {/* Main search box */}
              <div
                className={`
                  relative transition-all duration-300
                  ${showAutocomplete && suggestions.length > 0
                    ? 'rounded-t-[32px] rounded-b-none'
                    : 'rounded-full'
                  }
                `}
              >
                {/* Search bar background */}
                <div className={`
                  absolute inset-0 bg-card border border-border
                  ${showAutocomplete && suggestions.length > 0 ? 'rounded-t-[32px]' : 'rounded-full'}
                  shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1),0_8px_40px_-8px_rgba(0,0,0,0.05)]
                  ${!hasResults ? 'shadow-[0_8px_40px_-8px_rgba(0,0,0,0.15),0_4px_20px_-4px_rgba(0,0,0,0.1)]' : ''}
                `} />

                <div className={`relative flex items-center ${hasResults ? 'h-16' : 'h-16 md:h-[72px]'}`}>
                  {/* Search icon */}
                  <div className={`
                    flex items-center justify-center flex-shrink-0 transition-all
                    ${hasResults ? 'pl-6 pr-2' : 'pl-7 pr-3'}
                  `}>
                    <Search className={`text-muted-foreground ${hasResults ? 'w-5 h-5' : 'w-6 h-6'}`} />
                  </div>

                  {/* Input */}
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="Search for anything..."
                    value={searchInput}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    onFocus={() => {
                      if (searchInput.trim().length >= 2 && suggestions.length > 0) {
                        setShowAutocomplete(true);
                      }
                    }}
                    autoComplete="off"
                    style={{ fontSize: hasResults ? '22px' : '26px' }}
                    className={`
                      flex-1 border-0 bg-transparent outline-none
                      placeholder:text-muted-foreground text-foreground font-semibold tracking-tight
                      ${hasResults ? 'h-16 pr-40' : 'h-16 md:h-[72px] pr-44 md:pr-48'}
                    `}
                  />

                  {/* Search button */}
                  <div className={`flex-shrink-0 ${hasResults ? 'pr-2.5' : 'pr-3'}`}>
                    <Button
                      type="submit"
                      disabled={isLoading}
                      className={`
                        relative overflow-hidden cursor-pointer
                        bg-primary
                        hover:bg-primary/90
                        text-primary-foreground font-bold
                        rounded-full
                        transition-all duration-200
                        hover:scale-[1.02] active:scale-[0.98]
                        ${hasResults ? 'h-12 px-7 text-base' : 'h-12 md:h-14 px-7 md:px-8 text-base md:text-lg'}
                      `}
                    >
                      {isLoading ? (
                        <span className="relative flex items-center gap-2.5">
                          <span className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                          <span className={hasResults ? 'hidden sm:inline' : ''}>Searching</span>
                        </span>
                      ) : (
                        <span className="relative flex items-center gap-2.5">
                          Search
                          <ArrowRight className={`${hasResults ? 'w-4 h-4' : 'w-5 h-5'}`} />
                        </span>
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Autocomplete Dropdown - premium style */}
              {showAutocomplete && suggestions.length > 0 && (
                <div className="
                  absolute left-0 right-0 top-full z-[100]
                  bg-card/95 backdrop-blur-xl
                  border-x border-b border-border
                  rounded-b-[32px] overflow-hidden
                  shadow-[0_20px_40px_-15px_rgba(0,0,0,0.15)]
                ">
                  <div className="border-t border-border/50 mx-5" />
                  {isAutocompleteLoading && (
                    <div className="px-7 py-4 flex items-center gap-3 text-muted-foreground text-sm">
                      <span className="w-4 h-4 border-2 border-border border-t-muted-foreground rounded-full animate-spin" />
                      Loading suggestions...
                    </div>
                  )}
                  <ul className="py-3">
                    {suggestions.map((suggestion, index) => (
                      <li key={suggestion.text}>
                        <button
                          type="button"
                          onClick={() => handleSuggestionSelect(suggestion.text)}
                          className={`
                            w-full px-6 py-3 text-left flex items-center gap-4 transition-all duration-150 cursor-pointer
                            ${index === selectedSuggestionIndex
                              ? 'bg-muted'
                              : 'hover:bg-muted/50'
                            }
                          `}
                        >
                          <div className={`
                            w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-colors
                            ${index === selectedSuggestionIndex ? 'bg-secondary' : 'bg-muted'}
                          `}>
                            <Search className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <span className="text-foreground truncate text-base font-medium">
                            {suggestion.text}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Settings button - only when no results and no autocomplete */}
            {!hasResults && !showAutocomplete && (
              <div className="flex justify-center mt-8">
                <SettingsModal />
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <Alert variant="destructive" className="rounded-xl border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        </div>
      )}

      {/* Main Content */}
      {hasResults && (
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-6">
          {/* Search Stats Bar */}
          {query && pagination && (
            <div className="space-y-3 mb-4">
              {/* Stats + Controls Row */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="text-[15px] text-muted-foreground font-medium">
                    <span className="font-bold text-foreground">{pagination.totalItems.toLocaleString()}</span>
                    {' '}results for{' '}
                    <span className="font-bold text-foreground">&ldquo;{query}&rdquo;</span>
                    {took > 0 && <span className="text-muted-foreground/70 ml-1.5">in {took}ms</span>}
                  </p>
                  {/* Indexes searched */}
                  {indexesSearched.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-muted-foreground/50" />
                      {indexesSearched.map((idx) => (
                        <span key={idx.id} className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                          {idx.displayName || idx.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {/* Mobile filter toggle */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowMobileFilters(!showMobileFilters)}
                    className="lg:hidden h-9 px-3 rounded-lg"
                  >
                    <SlidersHorizontal className="w-4 h-4 mr-2" />
                    Filters
                  </Button>

                  {/* Score toggle */}
                  <button
                    type="button"
                    onClick={() => setShowScores(!showScores)}
                    className={`p-2 rounded-md transition-all cursor-pointer ${
                      showScores
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                    title={showScores ? 'Hide relevance scores' : 'Show relevance scores'}
                  >
                    {showScores ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>

                  {/* View mode toggle */}
                  <div className="flex items-center bg-muted rounded-lg p-1">
                    <button
                      type="button"
                      title="List view"
                      onClick={() => setViewMode('list')}
                      className={`p-2 rounded-md transition-all cursor-pointer ${
                        viewMode === 'list'
                          ? 'bg-background shadow-sm text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <LayoutList className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      title="Grid view"
                      onClick={() => setViewMode('grid')}
                      className={`p-2 rounded-md transition-all cursor-pointer ${
                        viewMode === 'grid'
                          ? 'bg-background shadow-sm text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Settings */}
                  <SettingsModal />
                </div>
              </div>

              {/* Active Filter Breadcrumbs */}
              {getTotalSelectedFacets() > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-muted-foreground">Filtered by:</span>
                  {Object.entries(selectedFacets).flatMap(([field, values]) =>
                    values.map((value) => (
                      <button
                        type="button"
                        key={`${field}-${value}`}
                        onClick={() => toggleFacet(field, value)}
                        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors cursor-pointer"
                      >
                        <span className="text-primary/60">{getFacetDisplayName(field)}:</span>
                        {value}
                        <X className="w-3 h-3" />
                      </button>
                    ))
                  )}
                  <button
                    type="button"
                    onClick={clearFacets}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer ml-1"
                  >
                    Clear all
                  </button>
                </div>
              )}
            </div>
          )}

          {/* AI Summary */}
          <StreamingAISummary
            query={query}
            results={results}
            isSearchLoading={isLoading}
            onFollowUpClick={handleFollowUpSearch}
          />

          {/* Refinement Chips */}
          {refinementChips.length > 0 && !isLoading && (
            <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
              <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Refine:</span>
              {refinementChips.map((chip) => (
                <button
                  type="button"
                  key={`${chip.facetField}-${chip.value}`}
                  onClick={() => toggleFacet(chip.facetField, chip.value)}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium bg-muted hover:bg-primary/10 hover:text-primary border border-border/50 hover:border-primary/20 transition-all cursor-pointer whitespace-nowrap"
                >
                  {chip.label}
                  <span className="text-muted-foreground/60">({chip.count})</span>
                </button>
              ))}
            </div>
          )}

          {/* Results Layout */}
          <div className="flex gap-8 lg:gap-10">
            {/* Facet Sidebar - Desktop */}
            <aside className={`
              ${showMobileFilters ? 'fixed inset-0 z-50 bg-black/50 lg:relative lg:bg-transparent' : 'hidden lg:block'}
              w-64 flex-shrink-0
            `}>
              <div className={`
                ${showMobileFilters ? 'absolute right-0 top-0 h-full w-80 bg-card shadow-xl overflow-hidden' : 'sticky top-24'}
                lg:relative lg:w-full lg:shadow-none
              `}>
                {showMobileFilters && (
                  <div className="flex items-center justify-between p-4 border-b lg:hidden">
                    <h2 className="text-lg font-bold">Filters</h2>
                    <button type="button" title="Close filters" onClick={() => setShowMobileFilters(false)} className="cursor-pointer">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                )}
                <div className={showMobileFilters ? 'p-4 overflow-y-auto h-[calc(100%-60px)]' : ''}>
                  <FacetSidebar
                    facets={facetsObject}
                    selectedFacets={selectedFacets}
                    onFacetChange={handleFacetChange}
                    onClearAll={clearFacets}
                    isLoading={isLoading}
                  />
                </div>
              </div>
            </aside>

            {/* Main Results */}
            <main className="flex-1 min-w-0">
              {/* Loading State */}
              {isLoading && results.length === 0 && (
                <div className={
                  viewMode === 'grid'
                    ? 'grid grid-cols-2 md:grid-cols-3 gap-4'
                    : 'space-y-4'
                }>
                  {[...Array(viewMode === 'grid' ? 6 : 4)].map((_, i) => (
                    <div key={i} className="animate-pulse">
                      <div className={`bg-muted rounded-2xl ${
                        viewMode === 'grid' ? 'aspect-[3/4]' : 'h-40'
                      }`} />
                    </div>
                  ))}
                </div>
              )}

              {/* Empty State */}
              {!isLoading && query && results.length === 0 && (
                <div className="text-center py-16">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Search className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-medium text-foreground mb-2">
                    No results found
                  </h3>
                  <p className="text-muted-foreground max-w-md mx-auto mb-4">
                    We couldn&apos;t find anything matching &ldquo;{query}&rdquo;.
                  </p>

                  {/* Suggest removing filters */}
                  {getTotalSelectedFacets() > 0 && (
                    <div className="mb-4">
                      <p className="text-sm text-muted-foreground mb-2">Try removing some filters:</p>
                      <div className="flex flex-wrap gap-2 justify-center">
                        {Object.entries(selectedFacets).flatMap(([field, values]) =>
                          values.map((value) => (
                            <button
                              type="button"
                              key={`${field}-${value}`}
                              onClick={() => toggleFacet(field, value)}
                              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors cursor-pointer"
                            >
                              {getFacetDisplayName(field)}: {value}
                              <X className="w-3 h-3" />
                            </button>
                          ))
                        )}
                        <button
                          type="button"
                          onClick={clearFacets}
                          className="inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          Clear all filters
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Suggest example queries */}
                  {getTotalSelectedFacets() === 0 && settings.exampleQueries && settings.exampleQueries.length > 0 && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Try searching for:</p>
                      <div className="flex flex-wrap gap-2 justify-center">
                        {settings.exampleQueries.map((q) => (
                          <button
                            type="button"
                            key={q}
                            onClick={() => handleFollowUpSearch(q)}
                            className="inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium bg-muted hover:bg-primary/10 hover:text-primary border border-border/50 hover:border-primary/20 transition-all cursor-pointer"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Results */}
              {results.length > 0 && (
                <div className={
                  viewMode === 'grid'
                    ? 'grid grid-cols-2 md:grid-cols-3 gap-4'
                    : 'space-y-4'
                }>
                  {results.map((result) => (
                    <DynamicResultCard
                      key={result.id}
                      result={result}
                      displayConfig={displayConfig}
                      viewMode={viewMode}
                      forceShowScore={showScores}
                    />
                  ))}
                </div>
              )}

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(pagination.page - 1)}
                    disabled={!pagination.hasPreviousPage || isLoading}
                    className="h-10 px-4 rounded-xl border-border hover:bg-muted cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Previous
                  </Button>

                  <div className="flex items-center gap-1 px-2">
                    {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                      const startPage = Math.max(1, pagination.page - 2);
                      const pageNumber = startPage + i;
                      if (pageNumber > pagination.totalPages) return null;

                      return (
                        <button
                          key={pageNumber}
                          onClick={() => setPage(pageNumber)}
                          disabled={isLoading}
                          className={`w-10 h-10 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                            pageNumber === pagination.page
                              ? 'bg-primary text-primary-foreground shadow-md'
                              : 'text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          {pageNumber}
                        </button>
                      );
                    }).filter(Boolean)}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(pagination.page + 1)}
                    disabled={!pagination.hasNextPage || isLoading}
                    className="h-10 px-4 rounded-xl border-border hover:bg-muted cursor-pointer"
                  >
                    Next
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              )}

              {/* Page info */}
              {pagination && pagination.totalPages > 1 && (
                <p className="text-center text-sm text-muted-foreground mt-4">
                  Showing {((pagination.page - 1) * pagination.pageSize) + 1}–{Math.min(pagination.page * pagination.pageSize, pagination.totalItems)} of {pagination.totalItems}
                </p>
              )}
            </main>
          </div>
        </div>
      )}

    </div>
  );
}
