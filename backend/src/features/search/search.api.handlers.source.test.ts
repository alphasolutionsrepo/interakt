// src/features/search/search.api.handlers.source.test.ts

/**
 * A search from the index playground is the admin's test: the search event and its AI calls
 * (the query embedding of a semantic or hybrid search) are recorded as playground traffic.
 */

import { NextRequest } from 'next/server';
import { describe, it, expect, vi } from 'vitest';

const seen = vi.hoisted(() => ({ sources: [] as unknown[] }));
vi.mock('@/features/global-settings', () => ({
  getGlobalSearchConfig: async () => ({ hybridDefaults: {}, timeout: { timeoutMs: 1000 } }),
}));
vi.mock('@/features/telemetry', () => ({ runWithTelemetryLevel: (_level: string, fn: () => unknown) => fn() }));
vi.mock('./search.service', async () => {
  const { getAnalyticsSourceContext } = await import('@/features/analytics/analytics-source-context');
  // The embedding is made after the search has started, as in search.service
  const search = async () => {
    await Promise.resolve();
    seen.sources.push(getAnalyticsSourceContext());
    return { hits: [] };
  };
  return { searchById: vi.fn(search), searchByName: vi.fn(search) };
});

import { handleSearchById, handleSearchByName } from './search.api.handlers';

const request = () =>
  new NextRequest('http://localhost/api/search', { method: 'POST', body: JSON.stringify({ query: 'linen shirts' }) });

describe('index playground search', () => {
  it('records its AI calls as playground traffic, by index id and by name', async () => {
    expect((await handleSearchById(request(), { id: crypto.randomUUID() })).status).toBe(200);
    expect((await handleSearchByName(request(), { name: 'products' })).status).toBe(200);

    expect(seen.sources).toEqual(['playground', 'playground']);
  });
});
