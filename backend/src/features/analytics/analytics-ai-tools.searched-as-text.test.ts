// src/features/analytics/analytics-ai-tools.searched-as-text.test.ts

/**
 * The Ask chat's search lookups show what was searched next to what the visitor typed, when
 * query understanding changed it, so an answer about a failing search can say what the engine
 * was actually asked.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { formatQuerySearchEventsForAI, formatRecentSearchesForAI } from './analytics-ai-tools';

const base = {
  timestamp: new Date('2026-11-17T10:00:00Z'), searchType: 'lexical', triggerType: 'user', triggerStep: null,
  totalResults: 0, durationMs: 20, success: true,
};

describe('search lookups in the Ask chat', () => {
  it('latest searches show "searched as" only where the query was changed', () => {
    const text = formatRecentSearchesForAI([
      { ...base, id: '1', query: 'can you find light linen shirts', searchedQuery: 'light linen shirts' },
      { ...base, id: '2', query: 'linen shirt', searchedQuery: null },
    ]);
    expect(text).toContain('"can you find light linen shirts" (searched as "light linen shirts")');
    expect(text.match(/searched as/g)).toHaveLength(1);
  });

  it('a query\'s searches list what they were searched as, most frequent first, and on failed samples', () => {
    const event = (id: string, searchedQuery: string | null) => ({
      ...base, id, query: 'how do I apply for financial aid', searchedQuery, isZeroResult: true, hasFilters: false,
    });
    const text = formatQuerySearchEventsForAI([
      event('1', 'apply financial aid'), event('2', 'apply financial aid'), event('3', 'financial aid application'), event('4', null),
    ], 'how do I apply for financial aid');

    expect(text).toContain('Searched as (query understanding changed the query):\n- "apply financial aid": 2 searches\n- "financial aid application": 1 search');
    expect(text).toContain('[searched as "apply financial aid"]');
  });

  it('a query nothing changed has no "searched as" section', () => {
    const text = formatQuerySearchEventsForAI([
      { ...base, id: '1', query: 'linen shirt', searchedQuery: null, isZeroResult: false, hasFilters: false, totalResults: 3 },
    ], 'linen shirt');
    expect(text).not.toContain('Searched as');
  });

  it('a search whose words all became filters reads "searched with filters only", in the list, the counts and the failed samples', () => {
    const recent = formatRecentSearchesForAI([
      { ...base, id: '1', query: 'red dresses under 50', searchedQuery: '' },
    ]);
    expect(recent).toContain('"red dresses under 50" (searched with filters only)');

    const event = (id: string, searchedQuery: string | null) => ({
      ...base, id, query: 'red dresses under 50', searchedQuery, isZeroResult: true, hasFilters: true, filterFields: ['color'],
    });
    const text = formatQuerySearchEventsForAI([event('1', ''), event('2', ''), event('3', 'red dresses')], 'red dresses under 50');
    expect(text).toContain('- (searched with filters only): 2 searches\n- "red dresses": 1 search');
    expect(text).toContain('[filters: color] [searched with filters only]');
  });
});
