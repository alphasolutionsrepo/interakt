// src/features/analytics/search-query-fields.test.ts

/** A search event keeps what the visitor typed as its query, and what was searched only when it differs. */

import { describe, expect, it } from 'vitest';

import { searchedAs, searchQueryFields } from './search-query-fields';

describe('searchQueryFields', () => {
  it('keeps the visitor\'s words as the query and the changed query as searched', () => {
    expect(searchQueryFields({ queryText: 'minimal style shirts summer', visitorQuery: 'show me minimal style shirts for summer' }))
      .toEqual({ queryText: 'show me minimal style shirts for summer', searchedQuery: 'minimal style shirts summer' });
  });

  it('records only the query when nothing changed it, or the caller has no other words', () => {
    expect(searchQueryFields({ queryText: 'linen shirt', visitorQuery: ' linen shirt ' })).toEqual({ queryText: 'linen shirt' });
    expect(searchQueryFields({ queryText: 'linen shirt' })).toEqual({ queryText: 'linen shirt' });
  });

  it('keeps the query searched when the visitor\'s words are empty, and stores an empty search beside real words', () => {
    // No words of the visitor's own: the search is recorded under what was searched
    expect(searchQueryFields({ queryText: 'linen shirt', visitorQuery: '  ' })).toEqual({ queryText: 'linen shirt' });
    // Every word moved into filters: the visitor's question stays, the empty query searched beside it
    expect(searchQueryFields({ queryText: '', visitorQuery: 'shirts under 50' })).toEqual({ queryText: 'shirts under 50', searchedQuery: '' });
  });
});

describe('searchedAs', () => {
  it('reads an empty searched query as filters only, a missing one as unchanged', () => {
    expect(searchedAs('minimal shirts')).toEqual({ query: 'minimal shirts' });
    expect(searchedAs('')).toEqual({ filtersOnly: true });
    expect(searchedAs(null)).toBeUndefined();
    expect(searchedAs(undefined)).toBeUndefined();
  });
});
