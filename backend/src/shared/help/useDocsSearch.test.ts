// src/shared/help/useDocsSearch.test.ts

/**
 * One docs search. With the Help assistant off the server refuses the docs-search route, so it
 * is not called at all: the title matching answers, marked as turned off.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const docs = vi.hoisted(() => ({
  searchDocs: vi.fn(),
  loadDocList: vi.fn(),
}));

vi.mock('./docs-search', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./docs-search')>()),
  searchDocs: docs.searchDocs,
  loadDocList: docs.loadDocList,
}));

import { DocsSearchUnavailableError } from './docs-search';
import { runDocsSearch } from './useDocsSearch';

const LIST = [{ slug: 'sync', title: 'Sync a source', group: 'Guides', summary: '' }];

beforeEach(() => {
  docs.searchDocs.mockReset();
  docs.loadDocList.mockReset().mockResolvedValue(LIST);
});

describe('runDocsSearch', () => {
  it('with the Help assistant off, never calls the docs search and matches titles', async () => {
    const state = await runDocsSearch('sync', null, new AbortController().signal, false);
    expect(docs.searchDocs).not.toHaveBeenCalled();
    expect(state).toMatchObject({ status: 'ready', fallback: true, turnedOff: true });
    expect(state?.hits.map((h) => h.slug)).toEqual(['sync']);
  });

  it('with it on, uses the docs search', async () => {
    docs.searchDocs.mockResolvedValue({ hits: [], groups: [], tookMs: 4 });
    const state = await runDocsSearch('sync', null, new AbortController().signal, true);
    expect(docs.searchDocs).toHaveBeenCalledTimes(1);
    expect(state).toMatchObject({ status: 'ready', fallback: false, turnedOff: false });
  });

  it('with it on, still falls back to titles when the search is unavailable', async () => {
    docs.searchDocs.mockRejectedValue(new DocsSearchUnavailableError('HTTP 404', true));
    const state = await runDocsSearch('sync', null, new AbortController().signal, true);
    expect(state).toMatchObject({ fallback: true, turnedOff: true });
  });
});
