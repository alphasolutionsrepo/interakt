// src/features/search/search-error.identity.test.ts

/**
 * Next.js bundles instrumentation (which registers the search providers at startup) apart
 * from the API routes, so a provider's SearchError comes from another copy of this module.
 * It must still count as a SearchError, or a refused filter answers as a server error.
 */

import { describe, expect, it, vi } from 'vitest';

import { SearchError } from './search.types';

describe('a SearchError from another copy of the module', () => {
    it('is still a SearchError', async () => {
        vi.resetModules();
        const other = await import('./search.types');
        expect(other.SearchError).not.toBe(SearchError);

        const error = new other.SearchError('failed to create query', 'INVALID_QUERY');
        expect(error).toBeInstanceOf(SearchError);
        expect(error).toBeInstanceOf(Error);
    });

    it('does not take any error for one', () => {
        expect(new Error('boom')).not.toBeInstanceOf(SearchError);
        expect(Object.assign(new Error('x'), { name: 'SearchError', code: 'INVALID_QUERY' })).not.toBeInstanceOf(SearchError);
        expect(null).not.toBeInstanceOf(SearchError);
    });
});
