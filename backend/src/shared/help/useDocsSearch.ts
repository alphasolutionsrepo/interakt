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
  /** The fallback is because the Help assistant is switched off, not because the search is still being set up */
  turnedOff: boolean;
}

const IDLE: DocsSearchState = { status: 'idle', hits: [], groups: [], tookMs: null, fallback: false, turnedOff: false };

/**
 * One search: the docs search, or title matching when that is unavailable. With `searchOn`
 * false (the Help assistant is off, so the server refuses the docs search) the search route
 * is not called at all and the title matching answers. Null when the search was aborted.
 */
export async function runDocsSearch(
  q: string,
  group: string | null,
  signal: AbortSignal,
  searchOn = true,
): Promise<DocsSearchState | null> {
  const titleMatches = async (turnedOff: boolean): Promise<DocsSearchState> => {
    const docs = await loadDocList();
    const all = filterDocList(docs, q);
    return {
      status: 'ready',
      hits: group ? filterDocList(docs, q, group) : all,
      groups: [...new Set(all.map((hit) => hit.group))],
      tookMs: null,
      fallback: true,
      turnedOff,
    };
  };

  try {
    if (!searchOn) return signal.aborted ? null : await titleMatches(true);
    // With a group selected, a second unfiltered request keeps every
    // chip visible, so the user can switch groups.
    const [all, filtered] = await Promise.all([
      searchDocs(q, { signal }),
      group ? searchDocs(q, { group, signal }) : Promise.resolve(null),
    ]);
    const shown = filtered ?? all;
    return { status: 'ready', hits: shown.hits, groups: all.groups, tookMs: shown.tookMs, fallback: false, turnedOff: false };
  } catch (e) {
    if (signal.aborted) return null;
    if (!searchOn || !(e instanceof DocsSearchUnavailableError)) return { ...IDLE, status: 'error' };
    try {
      const state = await titleMatches(e.turnedOff);
      return signal.aborted ? null : state;
    } catch {
      return signal.aborted ? null : { ...IDLE, status: 'error' };
    }
  }
}

/** `searchOn` false: skip the docs-search route (Help assistant off) and match titles only. */
export function useDocsSearch(query: string, group: string | null, searchOn = true): DocsSearchState {
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
      const next = await runDocsSearch(q, group, signal, searchOn);
      if (next && !signal.aborted) setState(next);
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, group, searchOn]);

  return state;
}
