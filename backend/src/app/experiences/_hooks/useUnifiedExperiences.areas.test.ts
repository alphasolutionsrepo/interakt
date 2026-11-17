// src/app/experiences/_hooks/useUnifiedExperiences.areas.test.ts

/**
 * The hook itself: which lists it asks the server for follows the feature areas. A kind whose
 * area is off (Chat for chat experiences, Search for search ones) is never requested, and its
 * count stays 0; while access loads neither is.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useUnifiedExperiences } from './useUnifiedExperiences';

import { uiAccess, uiAccessLoading } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);

const { seen, list } = vi.hoisted(() => {
  const seen = { ai: [] as Array<{ enabled?: boolean }>, search: [] as Array<{ enabled?: boolean }> };
  const list = (kind: 'ai' | 'search', counts: { total: number; active: number }) => (_p: unknown, opts: { enabled?: boolean }) => {
    seen[kind].push(opts);
    return {
      experiences: [], pagination: { page: 1, pageSize: 1, totalItems: 0, totalPages: 0, counts }, isLoading: false, isRefetching: false,
      refetch: () => {}, deleteExperience: () => {}, isDeleting: false,
    };
  };
  return { seen, list };
});
vi.mock('@/app/ai-experiences/_lib/hooks/useAIExperiences', () => ({ useAIExperiences: list('ai', { total: 3, active: 2 }) }));
vi.mock('@/app/search-experiences/_lib/hooks', () => ({ useSearchExperiences: list('search', { total: 5, active: 4 }) }));

type Result = ReturnType<typeof useUnifiedExperiences>;
function run(): Result {
  seen.ai.length = 0;
  seen.search.length = 0;
  let out!: Result;
  const Probe = () => { out = useUnifiedExperiences({ typeFilter: 'all' }); return null; };
  renderToStaticMarkup(createElement(Probe));
  return out;
}

describe('useUnifiedExperiences and the feature areas', () => {
  beforeEach(() => uiAccess.asAdmin());

  it('requests both lists with both areas on', () => {
    const r = run();
    expect(seen.ai[0].enabled).toBe(true);
    expect(seen.search[0].enabled).toBe(true);
    expect(r.metrics.total).toBe(8);
  });

  it('does not request chat experiences with Chat off, and counts only search ones', () => {
    uiAccess.areasOff('chat');
    const r = run();
    expect(seen.ai[0].enabled).toBe(false);
    expect(seen.search[0].enabled).toBe(true);
    expect(r.metrics).toMatchObject({ aiCount: 0, searchCount: 5, total: 5 });
  });

  it('does not request search experiences with Search off, and counts only chat ones', () => {
    uiAccess.areasOff('search');
    const r = run();
    expect(seen.ai[0].enabled).toBe(true);
    expect(seen.search[0].enabled).toBe(false);
    expect(r.metrics).toMatchObject({ aiCount: 3, searchCount: 0, total: 3 });
  });

  it('requests neither with both off', () => {
    uiAccess.areasOff('chat', 'search');
    run();
    expect(seen.ai[0].enabled).toBe(false);
    expect(seen.search[0].enabled).toBe(false);
  });

  it('requests neither while access loads, and reports loading', () => {
    uiAccessLoading();
    const r = run();
    expect(seen.ai[0].enabled).toBe(false);
    expect(seen.search[0].enabled).toBe(false);
    expect(r.isLoading).toBe(true);
  });
});
