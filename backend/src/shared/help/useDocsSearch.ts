'use client';

// src/shared/help/useDocsSearch.ts
//
// Search-as-you-type over the docs: debounced, cancels stale requests, keeps
// the previous results on screen while the next ones load, and falls back to
// title matching when full-text search isn't available.

import { useEffect, useState } from 'react';

import {
  DocsSearchUnavailableError,
  filterDocList,
  loadDocList,
  searchDocs,
  type DocsSearchHit,
} from './docs-search';

/** Long enough that typing at a normal pace sends one search per pause, not one per keystroke. */
const DEBOUNCE_MS = 300;

export interface DocsSearchState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  hits: DocsSearchHit[];
  /** Groups with matches for the current query, ignoring the group filter. */
  groups: string[];
  tookMs: number | null;
  /** True when results are title matches only (full-text search unavailable). */
  fallback: boolean;
}

const IDLE: DocsSearchState = { status: 'idle', hits: [], groups: [], tookMs: null, fallback: false };

export function useDocsSearch(query: string, group: string | null): DocsSearchState {
  const [state, setState] = useState<DocsSearchState>(IDLE);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setState(IDLE);
      return;
    }

    setState((s) => ({ ...s, status: 'loading' }));
    const controller = new AbortController();
    const { signal } = controller;

    const timer = setTimeout(async () => {
      try {
        // With a group selected, a second unfiltered request keeps every
        // chip visible, so the user can switch groups.
        const [all, filtered] = await Promise.all([
          searchDocs(q, { signal }),
          group ? searchDocs(q, { group, signal }) : Promise.resolve(null),
        ]);
        const shown = filtered ?? all;
        setState({
          status: 'ready',
          hits: shown.hits,
          groups: all.groups,
          tookMs: shown.tookMs,
          fallback: false,
        });
      } catch (e) {
        if (signal.aborted) return;
        if (!(e instanceof DocsSearchUnavailableError)) {
          setState({ ...IDLE, status: 'error' });
          return;
        }
        try {
          const docs = await loadDocList();
          if (signal.aborted) return;
          const all = filterDocList(docs, q);
          setState({
            status: 'ready',
            hits: group ? filterDocList(docs, q, group) : all,
            groups: [...new Set(all.map((hit) => hit.group))],
            tookMs: null,
            fallback: true,
          });
        } catch {
          if (!signal.aborted) setState({ ...IDLE, status: 'error' });
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, group]);

  return state;
}
