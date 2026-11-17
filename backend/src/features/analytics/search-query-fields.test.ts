// src/features/analytics/search-query-fields.test.ts

/** A search event keeps what the visitor typed as its query, and what was searched only when it differs. */

import { describe, expect, it } from 'vitest';

import { searchQueryFields } from './search-query-fields';

describe('searchQueryFields', () => {
  it('keeps the visitor\'s words as the query and the changed query as searched', () => {
    expect(searchQueryFields({ queryText: 'minimal style shirts summer', visitorQuery: 'show me minimal style shirts for summer' }))
      .toEqual({ queryText: 'show me minimal style shirts for summer', searchedQuery: 'minimal style shirts summer' });
  });

  it('records only the query when nothing changed it, or the caller has no other words', () => {
    expect(searchQueryFields({ queryText: 'linen shirt', visitorQuery: ' linen shirt ' })).toEqual({ queryText: 'linen shirt' });
    expect(searchQueryFields({ queryText: 'linen shirt' })).toEqual({ queryText: 'linen shirt' });
  });
});
