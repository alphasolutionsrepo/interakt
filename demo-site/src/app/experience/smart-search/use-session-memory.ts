'use client';

import { useState, useCallback, useRef } from 'react';
import type { Facet, SearchResult } from '@/lib/api/types';

// ============================================================================
// TYPES
// ============================================================================

export interface SearchEvent {
  query: string;
  timestamp: number;
  resultCount: number;
  facetsAvailable: string[]; // field names
}

export interface FacetSelection {
  field: string;
  value: string;
  timestamp: number;
  query: string; // which query this was for
}

export interface ResultClick {
  resultId: string;
  query: string;
  position: number; // rank in results
  timestamp: number;
  source: Record<string, unknown>; // the result's fields for pattern extraction
}

export interface SessionPattern {
  /** Facet values the user keeps selecting (field → values sorted by frequency) */
  preferredFacets: Record<string, { value: string; count: number }[]>;
  /** Fields that appear in clicked results — what the user gravitates toward */
  clickedFieldValues: Record<string, { value: string; count: number }[]>;
  /** Common themes across queries */
  queryThemes: string[];
  /** Price range the user seems interested in (if price data seen) */
  priceRange: { min: number; max: number } | null;
  /** How many searches deep the user is */
  searchDepth: number;
  /** Whether the user tends to use facets */
  usesFacets: boolean;
}

export interface SessionMemory {
  searches: SearchEvent[];
  facetSelections: FacetSelection[];
  clicks: ResultClick[];
  patterns: SessionPattern;
}

export interface UseSessionMemoryReturn {
  memory: SessionMemory;
  recordSearch: (query: string, resultCount: number, facets: Facet[]) => void;
  recordFacetSelection: (field: string, value: string, query: string) => void;
  recordClick: (result: SearchResult, query: string, position: number) => void;
  getPreferredFacetOrder: (facets: Facet[]) => Facet[];
  getSuggestedFilters: (facets: Facet[], selectedFacets: Record<string, string[]>) => SuggestedFilter[];
  getSuggestedQueries: () => string[];
  getInsight: () => string | null;
  reset: () => void;
}

export interface SuggestedFilter {
  field: string;
  value: string;
  reason: string; // why we're suggesting this
  confidence: 'high' | 'medium' | 'low';
}

// ============================================================================
// PATTERN EXTRACTION
// ============================================================================

function extractPatterns(
  searches: SearchEvent[],
  facetSelections: FacetSelection[],
  clicks: ResultClick[],
): SessionPattern {
  // Count facet selection frequency
  const facetCounts: Record<string, Record<string, number>> = {};
  for (const sel of facetSelections) {
    if (!facetCounts[sel.field]) facetCounts[sel.field] = {};
    facetCounts[sel.field][sel.value] = (facetCounts[sel.field][sel.value] || 0) + 1;
  }

  const preferredFacets: Record<string, { value: string; count: number }[]> = {};
  for (const [field, values] of Object.entries(facetCounts)) {
    preferredFacets[field] = Object.entries(values)
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);
  }

  // Extract field values from clicked results
  const clickedFieldCounts: Record<string, Record<string, number>> = {};
  for (const click of clicks) {
    for (const [key, val] of Object.entries(click.source)) {
      if (typeof val === 'string' && val.length < 50) {
        if (!clickedFieldCounts[key]) clickedFieldCounts[key] = {};
        clickedFieldCounts[key][val] = (clickedFieldCounts[key][val] || 0) + 1;
      }
    }
  }

  const clickedFieldValues: Record<string, { value: string; count: number }[]> = {};
  for (const [field, values] of Object.entries(clickedFieldCounts)) {
    const sorted = Object.entries(values)
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);
    if (sorted.length > 0 && sorted[0].count >= 2) {
      clickedFieldValues[field] = sorted.slice(0, 5);
    }
  }

  // Extract price range from clicks
  let priceRange: { min: number; max: number } | null = null;
  const prices = clicks
    .map((c) => {
      const p = c.source.price ?? c.source.minPrice ?? c.source.salePrice;
      return typeof p === 'number' ? p : typeof p === 'string' ? parseFloat(p) : NaN;
    })
    .filter((p) => !isNaN(p));

  if (prices.length >= 2) {
    priceRange = {
      min: Math.min(...prices),
      max: Math.max(...prices),
    };
  }

  // Extract query themes (simple: split into words, count frequency)
  const wordCounts: Record<string, number> = {};
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'for', 'in', 'on', 'with', 'to', 'of', 'is', 'it']);
  for (const s of searches) {
    const words = s.query.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !stopWords.has(w));
    for (const word of words) {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    }
  }
  const queryThemes = Object.entries(wordCounts)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);

  return {
    preferredFacets,
    clickedFieldValues,
    queryThemes,
    priceRange,
    searchDepth: searches.length,
    usesFacets: facetSelections.length > 0,
  };
}

// ============================================================================
// HOOK
// ============================================================================

export function useSessionMemory(): UseSessionMemoryReturn {
  const [memory, setMemory] = useState<SessionMemory>({
    searches: [],
    facetSelections: [],
    clicks: [],
    patterns: {
      preferredFacets: {},
      clickedFieldValues: {},
      queryThemes: [],
      priceRange: null,
      searchDepth: 0,
      usesFacets: false,
    },
  });

  // Use ref to avoid stale closures in callbacks
  const memoryRef = useRef(memory);
  memoryRef.current = memory;

  const updatePatterns = useCallback(
    (searches: SearchEvent[], facetSelections: FacetSelection[], clicks: ResultClick[]) => {
      return extractPatterns(searches, facetSelections, clicks);
    },
    [],
  );

  const recordSearch = useCallback(
    (query: string, resultCount: number, facets: Facet[]) => {
      setMemory((prev) => {
        const event: SearchEvent = {
          query,
          timestamp: Date.now(),
          resultCount,
          facetsAvailable: facets.map((f) => f.field),
        };
        const searches = [...prev.searches, event];
        const patterns = extractPatterns(searches, prev.facetSelections, prev.clicks);
        return { ...prev, searches, patterns };
      });
    },
    [],
  );

  const recordFacetSelection = useCallback(
    (field: string, value: string, query: string) => {
      setMemory((prev) => {
        const sel: FacetSelection = { field, value, timestamp: Date.now(), query };
        const facetSelections = [...prev.facetSelections, sel];
        const patterns = extractPatterns(prev.searches, facetSelections, prev.clicks);
        return { ...prev, facetSelections, patterns };
      });
    },
    [],
  );

  const recordClick = useCallback(
    (result: SearchResult, query: string, position: number) => {
      setMemory((prev) => {
        const click: ResultClick = {
          resultId: result.id,
          query,
          position,
          timestamp: Date.now(),
          source: result.source,
        };
        const clicks = [...prev.clicks, click];
        const patterns = extractPatterns(prev.searches, prev.facetSelections, clicks);
        return { ...prev, clicks, patterns };
      });
    },
    [],
  );

  // =========================================================================
  // INTELLIGENCE: Reorder facets based on user preferences
  // =========================================================================

  const getPreferredFacetOrder = useCallback(
    (facets: Facet[]): Facet[] => {
      const { preferredFacets } = memoryRef.current.patterns;
      if (Object.keys(preferredFacets).length === 0) return facets;

      return facets.map((facet) => {
        const prefs = preferredFacets[facet.field];
        if (!prefs || prefs.length === 0) return facet;

        // Reorder buckets: preferred values first, then the rest
        const prefValues = new Set(prefs.map((p) => p.value));
        const preferred = facet.buckets.filter((b) => prefValues.has(String(b.key)));
        const rest = facet.buckets.filter((b) => !prefValues.has(String(b.key)));
        return { ...facet, buckets: [...preferred, ...rest] };
      });
    },
    [],
  );

  // =========================================================================
  // INTELLIGENCE: Suggest filters based on session patterns
  // =========================================================================

  const getSuggestedFilters = useCallback(
    (facets: Facet[], selectedFacets: Record<string, string[]>): SuggestedFilter[] => {
      const m = memoryRef.current;
      const suggestions: SuggestedFilter[] = [];

      // 1. Suggest facets the user has selected before in this session
      for (const [field, prefs] of Object.entries(m.patterns.preferredFacets)) {
        const alreadySelected = selectedFacets[field] || [];
        for (const pref of prefs) {
          if (alreadySelected.includes(pref.value)) continue;
          // Check that this value still exists in current facets
          const facet = facets.find((f) => f.field === field);
          const bucket = facet?.buckets.find((b) => String(b.key) === pref.value);
          if (bucket) {
            suggestions.push({
              field,
              value: pref.value,
              reason: `You've selected this ${pref.count > 1 ? pref.count + ' times' : 'before'}`,
              confidence: pref.count >= 3 ? 'high' : pref.count >= 2 ? 'medium' : 'low',
            });
          }
        }
      }

      // 2. Suggest facets based on clicked result patterns
      for (const [field, vals] of Object.entries(m.patterns.clickedFieldValues)) {
        const alreadySelected = selectedFacets[field] || [];
        const facet = facets.find((f) => f.field === field);
        if (!facet) continue;

        for (const v of vals) {
          if (alreadySelected.includes(v.value)) continue;
          const bucket = facet.buckets.find((b) => String(b.key) === v.value);
          if (bucket) {
            suggestions.push({
              field,
              value: v.value,
              reason: `Appears in ${v.count} items you viewed`,
              confidence: v.count >= 3 ? 'high' : 'medium',
            });
          }
        }
      }

      // 3. Suggest dominant facet values (>60% of results)
      for (const facet of facets) {
        const total = facet.buckets.reduce((sum, b) => sum + b.count, 0);
        if (total === 0) continue;
        const alreadySelected = selectedFacets[facet.field] || [];

        for (const bucket of facet.buckets.slice(0, 3)) {
          if (alreadySelected.includes(String(bucket.key))) continue;
          const share = bucket.count / total;
          if (share > 0.6 && suggestions.every((s) => !(s.field === facet.field && s.value === String(bucket.key)))) {
            suggestions.push({
              field: facet.field,
              value: String(bucket.key),
              reason: `${Math.round(share * 100)}% of results`,
              confidence: 'low',
            });
          }
        }
      }

      // Deduplicate and sort by confidence
      const seen = new Set<string>();
      const order = { high: 0, medium: 1, low: 2 };
      return suggestions
        .filter((s) => {
          const key = `${s.field}:${s.value}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) => order[a.confidence] - order[b.confidence])
        .slice(0, 6);
    },
    [],
  );

  // =========================================================================
  // INTELLIGENCE: Suggest follow-up queries
  // =========================================================================

  const getSuggestedQueries = useCallback((): string[] => {
    const m = memoryRef.current;
    if (m.searches.length === 0) return [];
    const suggestions: string[] = [];
    const lastQuery = m.searches[m.searches.length - 1]?.query || '';

    // Combine query themes with preferred facet values for new query ideas
    const topFacetValues = Object.values(m.patterns.preferredFacets)
      .flatMap((prefs) => prefs.slice(0, 1).map((p) => p.value))
      .slice(0, 2);

    if (topFacetValues.length > 0 && lastQuery) {
      for (const val of topFacetValues) {
        const suggestion = `${lastQuery} ${val.toLowerCase()}`;
        if (!m.searches.some((s) => s.query.toLowerCase() === suggestion.toLowerCase())) {
          suggestions.push(suggestion);
        }
      }
    }

    // Suggest broadening if results were low
    const lastSearch = m.searches[m.searches.length - 1];
    if (lastSearch && lastSearch.resultCount < 5 && lastQuery.split(/\s+/).length > 2) {
      const words = lastQuery.split(/\s+/);
      suggestions.push(words.slice(0, Math.ceil(words.length / 2)).join(' '));
    }

    return suggestions.slice(0, 3);
  }, []);

  // =========================================================================
  // INTELLIGENCE: Generate human-readable insight
  // =========================================================================

  const getInsight = useCallback((): string | null => {
    const m = memoryRef.current;
    const { patterns } = m;

    if (patterns.searchDepth < 2) return null;

    const parts: string[] = [];

    // Theme insight
    if (patterns.queryThemes.length > 0) {
      parts.push(`You seem interested in ${patterns.queryThemes.slice(0, 2).join(' and ')}`
      );
    }

    // Preference insight
    const topPref = Object.entries(patterns.preferredFacets)
      .filter(([, vals]) => vals[0]?.count >= 2)
      .map(([field, vals]) => `${vals[0].value}`);
    if (topPref.length > 0) {
      parts.push(`leaning toward ${topPref.slice(0, 2).join(', ')}`);
    }

    // Price insight
    if (patterns.priceRange) {
      parts.push(
        `browsing in the $${Math.round(patterns.priceRange.min)}–$${Math.round(patterns.priceRange.max)} range`,
      );
    }

    if (parts.length === 0) return null;
    return parts.join(', ') + '.';
  }, []);

  // =========================================================================
  // RESET
  // =========================================================================

  const reset = useCallback(() => {
    setMemory({
      searches: [],
      facetSelections: [],
      clicks: [],
      patterns: {
        preferredFacets: {},
        clickedFieldValues: {},
        queryThemes: [],
        priceRange: null,
        searchDepth: 0,
        usesFacets: false,
      },
    });
  }, []);

  return {
    memory,
    recordSearch,
    recordFacetSelection,
    recordClick,
    getPreferredFacetOrder,
    getSuggestedFilters,
    getSuggestedQueries,
    getInsight,
    reset,
  };
}
