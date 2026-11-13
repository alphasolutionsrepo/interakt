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

  const abortedSignal = () => { const c = new AbortController(); c.abort(); return c.signal; };
  const live = () => new AbortController().signal;
  const ERROR = { status: 'error', hits: [], groups: [], tookMs: null, fallback: false, turnedOff: false };

  describe('aborted', () => {
    it('Help assistant off: answers null, not stale titles, when already aborted', async () => {
      expect(await runDocsSearch('sync', null, abortedSignal(), false)).toBeNull();
    });

    it('Help assistant on: answers null when aborted while the search runs', async () => {
      const c = new AbortController();
      docs.searchDocs.mockImplementation(async () => { c.abort(); throw Object.assign(new Error('aborted'), { name: 'AbortError' }); });
      expect(await runDocsSearch('sync', null, c.signal, true)).toBeNull();
    });

    it('Help assistant on: answers null when aborted while the title fallback loads', async () => {
      const c = new AbortController();
      docs.searchDocs.mockRejectedValue(new DocsSearchUnavailableError('HTTP 503'));
      docs.loadDocList.mockImplementation(async () => { c.abort(); return LIST; });
      expect(await runDocsSearch('sync', null, c.signal, true)).toBeNull();
    });

    it('Help assistant on: answers null when aborted and the title fallback also fails', async () => {
      const c = new AbortController();
      docs.searchDocs.mockRejectedValue(new DocsSearchUnavailableError('HTTP 503'));
      docs.loadDocList.mockImplementation(async () => { c.abort(); throw new Error('x'); });
      expect(await runDocsSearch('sync', null, c.signal, true)).toBeNull();
    });
  });

  describe('errors', () => {
    it('Help assistant off: an error loading the titles is an error state', async () => {
      docs.loadDocList.mockRejectedValue(new Error('offline'));
      expect(await runDocsSearch('sync', null, live(), false)).toEqual(ERROR);
      expect(docs.searchDocs).not.toHaveBeenCalled();
    });

    it('Help assistant off: an "unavailable" error while loading the titles is still an error state, not a fallback', async () => {
      docs.loadDocList.mockRejectedValueOnce(new DocsSearchUnavailableError('HTTP 503'));
      expect(await runDocsSearch('sync', null, live(), false)).toEqual(ERROR);
    });

    it('Help assistant on: an unexpected search error is an error state, with no title fallback', async () => {
      docs.searchDocs.mockRejectedValue(new Error('bad payload'));
      expect(await runDocsSearch('sync', null, live(), true)).toEqual(ERROR);
      expect(docs.loadDocList).not.toHaveBeenCalled();
    });

    it('Help assistant on: search unavailable (engine down) falls back to titles, not marked turned off', async () => {
      docs.searchDocs.mockRejectedValue(new DocsSearchUnavailableError('HTTP 503'));
      expect(await runDocsSearch('sync', null, live(), true)).toMatchObject({ status: 'ready', fallback: true, turnedOff: false });
    });

    it('Help assistant on: search unavailable and the titles fail too is an error state', async () => {
      docs.searchDocs.mockRejectedValue(new DocsSearchUnavailableError('HTTP 503'));
      docs.loadDocList.mockRejectedValue(new Error('offline'));
      expect(await runDocsSearch('sync', null, live(), true)).toEqual(ERROR);
    });
  });
});
